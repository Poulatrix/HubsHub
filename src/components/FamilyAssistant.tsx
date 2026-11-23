import { useState, useEffect, useRef } from "react";
import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Volume2, VolumeX, Sparkles, X, MessageSquare, ListTodo } from "lucide-react";
import { db } from "@/lib/firebase";
import { getSupabase } from "@/lib/supabase";
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, where } from "firebase/firestore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { notifyFamily } from "@/lib/pushNotifications";
import { startOfDay } from "date-fns";

interface FamilyAssistantProps {
  familyId: string;
  user: any;
  members: any[];
}

export function FamilyAssistant({ familyId, user, members }: FamilyAssistantProps) {
  const [isThinking, setIsThinking] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const stateRef = useRef({ familyId, user, members });
  useEffect(() => {
    stateRef.current = { familyId, user, members };
  }, [familyId, user, members]);

  const startAudioEngine = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 64; 
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processAudioAction(audioBlob);
      };

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += (dataArray[i] * dataArray[i]);
        }
        const rms = Math.sqrt(sum / bufferLength);
        setVolume(rms * 1.5);
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      
      updateVolume();
      mediaRecorder.start();
      setIsRecording(true);
      return true;
    } catch (err) {
      console.error("Audio Engine Error:", err);
      toast.error("Impossible d'accéder au micro.");
      return false;
    }
  };

  const stopAudioEngine = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setVolume(0);
  };

  const processAudioAction = async (blob: Blob) => {
    setIsThinking(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        handleCombinedQuery(base64Audio);
      };
    } catch (err) {
      console.error("Audio conversion error", err);
      setIsThinking(false);
    }
  };

  const handleCombinedQuery = async (base64Audio: string) => {
    setAiResponse("");
    setLastTranscript("Analyse de la demande...");
    const { familyId: currentFamilyId, user: currentUser, members: currentMembers } = stateRef.current;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const addTaskTool: FunctionDeclaration = {
        name: "addTask",
        description: "Ajoute une tâche à la liste.",
        parameters: {
          type: Type.OBJECT,
          properties: { title: { type: Type.STRING }, description: { type: Type.STRING }, assigneeName: { type: Type.STRING } },
          required: ["title"]
        }
      };

      const postToWallTool: FunctionDeclaration = {
        name: "postToWall",
        description: "Publie un message sur le mur.",
        parameters: {
          type: Type.OBJECT,
          properties: { content: { type: Type.STRING } },
          required: ["content"]
        }
      };

      const addShoppingItemTool: FunctionDeclaration = {
        name: "addShoppingItem",
        description: "Ajoute un article à la liste de courses.",
        parameters: {
          type: Type.OBJECT,
          properties: { 
            name: { type: Type.STRING, description: "Nom de l'article (ex: Lait, Pommes)" }, 
            quantity: { type: Type.NUMBER, description: "Quantité (par défaut 1)" }, 
            unit: { type: Type.STRING, description: "Unité (ex: litres, kg, bouteilles)" } 
          },
          required: ["name"]
        }
      };

      const tools = [{ 
        functionDeclarations: [
          addTaskTool, 
          postToWallTool,
          addShoppingItemTool,
          { name: "getDailySummary", description: "Résumé jour" }, 
          { name: "suggestDinner", description: "Dîner" }, 
          { name: "recommendMovie", description: "Film" }
        ] 
      }];

      const modelName = "gemini-3.1-pro-preview";
      const systemInstruction = `Tu es l'âme de la FamilyHub. Tu analyses l'audio pour agir sur l'app.
      Famille: ${currentMembers.map(m => `${m.name || m.displayName || 'Sans nom'} (${m.role || 'Membre'})`).join(", ")}.
      Utilisateur: ${currentUser.displayName}.
      
      RÈGLES CRITIQUES:
      1. Si une tâche est demandée sans préciser pour QUI, NE L'AJOUTE PAS immédiatement. Demande d'abord : "À qui dois-je attribuer cette tâche ?"
      2. Réponds toujours de manière chaleureuse en français.
      3. Pour les courses, tu peux ajouter des articles à la liste.`;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "audio/webm", data: base64Audio } },
            { text: "Agis selon la demande audio." }
          ]
        }],
        config: {
          systemInstruction,
          tools
        }
      });

      let finalResponse = (response.text || "").trim();
      const functionCalls = response.functionCalls;

      if (functionCalls) {
        for (const call of functionCalls) {
          if (call.name === "addTask") {
            const { title, description, assigneeName } = call.args as any;
            let assigneeIds = [currentUser.uid];
            if (assigneeName && typeof assigneeName === 'string') {
              const lowerAssignee = assigneeName.toLowerCase();
              const matched = currentMembers.find(m => 
                (m.name && typeof m.name === 'string' && m.name.toLowerCase().includes(lowerAssignee)) ||
                (m.displayName && typeof m.displayName === 'string' && m.displayName.toLowerCase().includes(lowerAssignee))
              );
              if (matched) assigneeIds = [matched.uid];
            }
            await addDoc(collection(db, "families", currentFamilyId, "todos"), { title, description: description || null, assignedToIds: assigneeIds, status: 'todo', createdAt: serverTimestamp() });
            logActivity({ familyId: currentFamilyId, userId: "ai-assistant", userName: "Assistant Familial", type: "task", action: "create", details: `Assistant a ajouté: ${title}` });
            finalResponse += `\nTâche "${title}" ajoutée !`;
          }
          if (call.name === "postToWall") {
            const { content } = call.args as any;
            await addDoc(collection(db, "families", currentFamilyId, "wall"), { content, authorUid: "ai-assistant", authorName: "Assistant Familial", timestamp: serverTimestamp() });
            logActivity({ familyId: currentFamilyId, userId: "ai-assistant", userName: "Assistant Familial", type: "wall", action: "create", details: "Assistant a posté sur le mur." });
            finalResponse += `\nMessage posté sur le mur !`;
          }
          if (call.name === "addShoppingItem") {
            const { name, quantity, unit } = call.args as any;
            const supabase = getSupabase();
            await supabase.from('shopping_list').insert([{
              name: name.trim(),
              quantity: parseFloat(quantity) || 1,
              unit: (unit || "").trim(),
              checked: false
            }]);
            
            const qtyInfo = (quantity && quantity !== 1) || unit ? ` (${quantity || 1}${unit ? ' ' + unit : ''})` : "";
            notifyFamily(currentFamilyId, currentUser.uid, "Course ajoutée (IA)", `${name}${qtyInfo} ajouté à la liste.`, '/');
            logActivity({ familyId: currentFamilyId, userId: "ai-assistant", userName: "Assistant Familial", type: "shopping", action: "create", details: `${name}${qtyInfo}` });
            finalResponse += `\n${name} ajouté à la liste de courses !`;
          }
          if (call.name === "getDailySummary") {
            const q = query(collection(db, "families", currentFamilyId, "activities"), where("timestamp", ">=", startOfDay(new Date())), orderBy("timestamp", "desc"));
            const snap = await getDocs(q);
            const acts = snap.docs.map(d => d.data());
            const sumRes = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: `Résume ces activités de manière chaleureuse: ${JSON.stringify(acts)}`
            });
            finalResponse = sumRes.text || "La journée a été bien remplie !";
          }
          if (call.name === "suggestDinner") {
             const res = await ai.models.generateContent({
               model: "gemini-3-flash-preview",
               contents: "Propose une idée de dîner familial simple, sain et rapide. Ajoute une petite touche d'humour."
             });
             finalResponse = res.text || "Pourquoi pas un bon gratin de légumes ?";
          }
          if (call.name === "recommendMovie") {
            const res = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: "Recommande un film familial chaleureux pour ce soir."
            });
            finalResponse = res.text || "Je vous conseille un classique de Disney !";
          }
        }
      }

      setAiResponse(finalResponse);
      setLastTranscript("Demande traitée !");
      if (!isMuted) speak(finalResponse);
    } catch (error) {
      console.error("AI Error:", error);
      toast.error("Erreur d'analyse.");
    } finally {
      setIsThinking(false);
    }
  };

  const speak = async (text: string) => {
    if (!text || isMuted) return;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
        }
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBlob = b64toBlob(base64Audio, 'audio/pcm');
        const arrayBuffer = await audioBlob.arrayBuffer();
        if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        const float32Array = pcmToFloat32(new Int16Array(arrayBuffer));
        const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start();
      }
    } catch (err) {
      console.error("TTS Error:", err);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      window.speechSynthesis.speak(utterance);
    }
  };

  const b64toBlob = (b64Data: string, contentType = '', sliceSize = 512) => {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: contentType });
  };

  const pcmToFloat32 = (pcmData: Int16Array) => {
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) float32Data[i] = pcmData[i] / 32768;
    return float32Data;
  };

  const toggleListening = () => {
    if (isRecording) stopAudioEngine();
    else {
      window.speechSynthesis.cancel();
      setAiResponse("");
      setLastTranscript("");
      startAudioEngine();
    }
  };

  return (
    <>
      <div className="fixed bottom-24 right-8 z-[100]">
        <motion.button
          layoutId="assistant-orb"
          onClick={() => setIsOpen(!isOpen)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-colors overflow-hidden relative",
            isOpen ? "bg-slate-900 border-2 border-blue-500/50" : "bg-gradient-to-tr from-blue-600 to-indigo-600"
          )}
        >
          {isOpen ? <X className="w-8 h-8 text-white relative z-10" /> : <Sparkles className="w-8 h-8 text-white relative z-10" />}
          {!isOpen && (
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute inset-0 bg-blue-400 blur-xl opacity-30"
            />
          )}
        </motion.button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
            className="fixed bottom-44 right-8 z-[100] w-[350px] max-w-[90vw] glass-dark border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="p-6 bg-gradient-to-b from-blue-600/20 to-transparent flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Assistant Familial</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-emerald-400 font-bold uppercase">Connecté</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsMuted(!isMuted)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-blue-400" />}
              </button>
            </div>

            <div className="flex-1 p-6 space-y-4 min-h-[200px] max-h-[400px] overflow-y-auto">
              {!lastTranscript && !aiResponse && !isThinking && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-8">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
                    <Mic className="w-8 h-8 text-slate-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-300">Comment puis-je aider ?</p>
                </div>
              )}

              {lastTranscript && (
                <div className="bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tr-none text-sm text-slate-200">
                  {lastTranscript}
                </div>
              )}

              {isThinking && (
                <div className="flex gap-1 justify-center py-4">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  ))}
                </div>
              )}

              {aiResponse && (
                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl rounded-tl-none text-sm text-white leading-relaxed">
                  {aiResponse}
                </div>
              )}
            </div>

            <div className="p-6 bg-white/5 flex flex-col items-center border-t border-white/5 relative">
              {isRecording && (
                <div className="absolute top-0 left-0 w-full flex justify-center items-end gap-1 opacity-80 -translate-y-full pb-6 h-12">
                  {[...Array(15)].map((_, i) => {
                    const multiplier = 1 - Math.abs(i - 7) / 10;
                    const barHeight = Math.max(4, (volume * multiplier) * 0.8);
                    return (
                      <motion.div key={i} animate={{ height: [4, barHeight, 4], backgroundColor: volume > 10 ? ["#60a5fa", "#3b82f6", "#60a5fa"] : "#334155" }} transition={{ duration: 0.15, repeat: Infinity, delay: i * 0.02 }} className="w-1.5 rounded-full" style={{ height: 4 }} />
                    );
                  })}
                </div>
              )}
              
              <button
                onClick={toggleListening}
                disabled={isThinking}
                className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center transition-all relative group",
                  isRecording ? "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]" : "bg-blue-600 hover:bg-blue-500",
                  isThinking && "opacity-50 cursor-not-allowed"
                )}
              >
                {isRecording && <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.2, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} className="absolute inset-0 bg-red-400 rounded-full" />}
                {isRecording ? <MicOff className="w-8 h-8 text-white relative z-10" /> : <Mic className="w-8 h-8 text-white relative z-10" />}
              </button>
              <p className="mt-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {isRecording ? "Je vous écoute..." : isThinking ? "Je réfléchis..." : "Appuyez pour parler"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
