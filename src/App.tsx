import { useState, useEffect } from "react";
import { auth, db, OperationType, handleFirestoreError } from "./lib/firebase";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  onSnapshot,
  updateDoc,
  arrayUnion
} from "firebase/firestore";
import { 
  ShoppingCart, 
  Settings, 
  LogOut, 
  Plus, 
  Users, 
  Calendar,
  Home,
  X,
  Mail,
  CheckCircle,
  Check,
  AlertTriangle,
  Delete,
  Cloud,
  Sun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Wind
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GlassCard } from "./components/GlassCard";
import { Clock } from "./components/Clock";
import { Weather } from "./components/Weather";
import { Wall } from "./components/Wall";
import { ShoppingList } from "./components/ShoppingList";
import { TodoList } from "./components/TodoList";
import { FamilyAdmin } from "./components/FamilyAdmin";
import { FamilyCalendar } from "./components/FamilyCalendar";
import { FamilyAssistant } from "./components/FamilyAssistant";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { cn } from "./lib/utils";
import { format } from "date-fns";
import { fr } from 'date-fns/locale';
import { motion, AnimatePresence } from "motion/react";

import { Dashboard, DashboardItem } from "./components/Dashboard";
import { registerServiceWorker, subscribeToPush } from "./lib/pushNotifications";

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role?: 'parent' | 'child';
  pin?: string;
  familyIds: string[];
  lastActiveFamilyId?: string;
  dashboardLayout?: DashboardItem[];
}

const NEUTRAL_PROFILE: UserProfile = {
  uid: "neutral",
  displayName: "Maison",
  email: "neutral@familyhub.local",
  familyIds: [],
  role: 'child' // Maison has no edit rights, behaves like a child or guest
};

interface Invitation {
  id: string;
  email: string;
  familyId: string;
  familyName: string;
  invitedBy: string;
  role: string;
  status: 'pending' | 'accepted' | 'declined';
}

function HeaderWeather({ city }: { city: string }) {
  const [data, setData] = useState<{ temp: number; icon: React.ReactNode; label: string } | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setHasError(false);

    async function fetchHeaderWeather() {
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`);
        const geoData = await geoRes.json();
        if (!geoData || geoData.length === 0 || !active) {
          if (active) setHasError(true);
          return;
        }
        const { lat, lon } = geoData[0];

        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
        const weatherData = await weatherRes.json();
        if (!active || !weatherData?.current) {
          if (active) setHasError(true);
          return;
        }

        const current = weatherData.current;
        const code = current.weather_code;

        let icon = <Cloud className="w-4 h-4 sm:w-5 sm:h-5 text-blue-200" />;
        let label = "Nuageux";

        if (code === 0) { icon = <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />; label = "Dégagé"; }
        else if (code === 1) { icon = <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-300" />; label = "Principalement dégagé"; }
        else if (code === 2) { icon = <Cloud className="w-4 h-4 sm:w-5 sm:h-5 text-blue-200" />; label = "Partiellement nuageux"; }
        else if (code === 3) { icon = <Cloud className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />; label = "Couvert"; }
        else if ([45, 48].includes(code)) { icon = <Wind className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300" />; label = "Brouillard"; }
        else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) { icon = <CloudRain className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />; label = "Pluie"; }
        else if ([71, 73, 75].includes(code)) { icon = <CloudSnow className="w-4 h-4 sm:w-5 sm:h-5 text-white" />; label = "Neige"; }
        else if (code === 95) { icon = <CloudLightning className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />; label = "Orage"; }

        setData({
          temp: Math.round(current.temperature_2m),
          icon,
          label
        });
        setHasError(false);
      } catch (err) {
        console.error("Header weather error:", err);
        if (active) setHasError(true);
      }
    }
    fetchHeaderWeather();
    const interval = setInterval(fetchHeaderWeather, 600000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [city]);

  if (!data && !hasError) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 opacity-40 animate-pulse bg-white/5 rounded-xl border border-white/10">
        <span className="text-xs sm:text-sm font-bold tabular-nums">--°C</span>
        <Cloud className="w-4 h-4 text-blue-200" />
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={
        <button
          type="button"
          title={data ? `${data.label} · ${city}` : `Météo · ${city}`}
          aria-label={`Ouvrir les prévisions météo pour ${city}`}
          className="flex items-center gap-2 sm:gap-3 px-2.5 py-1.5 sm:px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all cursor-pointer select-none active:scale-95 group shrink-0"
        >
          <div className="flex flex-col items-end leading-none">
            <span className="text-xs sm:text-base font-bold tracking-tight text-white tabular-nums">
              {data ? `${data.temp}°C` : "--°C"}
            </span>
            <span className="text-[8px] font-bold text-white/45 tracking-wider uppercase mt-0.5 max-w-[64px] truncate hidden sm:block">
              {city}
            </span>
          </div>
          <div className="p-0.5 sm:p-1 rounded-lg bg-white/5 group-hover:scale-110 transition-transform">
            {data ? data.icon : <Cloud className="w-4 h-4 text-blue-200" />}
          </div>
        </button>
      } />
      <DialogContent className="sm:max-w-xl bg-[#4a1d96] border-white/10 text-white p-0 overflow-hidden max-h-[90vh] flex flex-col rounded-3xl">
        <DialogHeader className="p-6 pb-0 shrink-0">
          <DialogTitle className="text-xl font-bold text-white">Prévisions Météo · {city}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto max-h-[70vh] p-2">
          <Weather familyLocation={city} isCompact={false} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authUserProfile, setAuthUserProfile] = useState<UserProfile | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [familyMembers, setFamilyMembers] = useState<UserProfile[]>([]);
  const [families, setFamilies] = useState<{id: string, name: string}[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'shopping' | 'calendar' | 'todos' | 'admin'>('home');
  const [isUsersOpen, setIsUsersOpen] = useState(false);
  const [familyLocation, setFamilyLocation] = useState("Paris");
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (!activeProfile || activeProfile.uid === 'neutral') return;

    let timer: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setActiveProfile(NEUTRAL_PROFILE);
      }, 30000);
    };

    const events = ['mousemove', 'mousedown', 'touchstart', 'keydown'];
    events.forEach(e => window.addEventListener(e, resetTimer));

    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearTimeout(timer);
    };
  }, [activeProfile]);

  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pinToVerify, setPinToVerify] = useState("");
  const [pendingProfile, setPendingProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    registerServiceWorker();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchProfile(firebaseUser.uid, firebaseUser.email || "", firebaseUser.displayName || "");
        listenToInvitations(firebaseUser.email || "");
      } else {
        setAuthUserProfile(null);
        setActiveProfile(null);
        setFamilies([]);
        setInvitations([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const listenToInvitations = (email: string) => {
    const q = query(
      collection(db, "invitations"), 
      where("email", "==", email.toLowerCase()), 
      where("status", "==", "pending")
    );
    return onSnapshot(q, (snapshot) => {
      setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invitation)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "invitations");
    });
  };

  useEffect(() => {
    if (!activeFamilyId) return;

    const membersUnsubscribe = onSnapshot(collection(db, "families", activeFamilyId, "users"), (snapshot) => {
      const members = snapshot.docs.map(doc => ({ ...doc.data() } as UserProfile));
      const allMembers = [NEUTRAL_PROFILE, ...members];
      setFamilyMembers(allMembers);

      // Restore active profile from localStorage if it belongs to this family
      const storedProfileId = localStorage.getItem(`activeProfile_${activeFamilyId}`);
      if (storedProfileId) {
        const found = allMembers.find(m => m.uid === storedProfileId);
        if (found) setActiveProfile(found);
      } else if (authUserProfile && members.some(m => m.uid === authUserProfile.uid)) {
        setActiveProfile(members.find(m => m.uid === authUserProfile.uid) || NEUTRAL_PROFILE);
      } else {
        setActiveProfile(NEUTRAL_PROFILE);
      }
    });

    return () => membersUnsubscribe();
  }, [activeFamilyId, authUserProfile]);

  const fetchProfile = async (uid: string, email: string, initialDisplayName?: string) => {
    try {
      const userRef = doc(db, "users", uid);
      const userDoc = await getDoc(userRef);
      let familiesList: {id: string, name: string}[] = [];
      let foundProfile: UserProfile | null = null;

      if (userDoc.exists()) {
        foundProfile = userDoc.data() as UserProfile;
        if ((!foundProfile.displayName || foundProfile.displayName === "Utilisateur") && initialDisplayName) {
          foundProfile.displayName = initialDisplayName;
          await updateDoc(userRef, { displayName: initialDisplayName });
        }
      } else {
        // Create initial profile
        const effectiveName = initialDisplayName || auth.currentUser?.displayName || (email ? email.split('@')[0] : "Utilisateur");
        foundProfile = {
          uid,
          displayName: effectiveName,
          email,
          familyIds: [],
          lastActiveFamilyId: ""
        };
        await setDoc(userRef, foundProfile);
      }

      // RECOVERY: If familyIds is empty, try to find families where user is admin
      // This helps if the user had families before the global users collection was added
      if (!foundProfile.familyIds || foundProfile.familyIds.length === 0) {
        const q = query(collection(db, "families"), where("adminUids", "array-contains", uid));
        const adminFamilies = await getDocs(q);
        if (!adminFamilies.empty) {
          const recoveredIds = adminFamilies.docs.map(d => d.id);
          foundProfile.familyIds = recoveredIds;
          await updateDoc(userRef, { familyIds: recoveredIds });
        }
      }

      // Fetch names for all families in profile
      if (foundProfile.familyIds && foundProfile.familyIds.length > 0) {
        for (const fId of foundProfile.familyIds) {
          const fDoc = await getDoc(doc(db, "families", fId));
          if (fDoc.exists()) {
            familiesList.push({ id: fId, name: fDoc.data().name });
          }
        }
      }

      setFamilies(familiesList);
      
      if (familiesList.length > 0) {
        const lastId = foundProfile?.lastActiveFamilyId || familiesList[0].id;
        setActiveFamilyId(lastId);

        // Fetch user role from family subcollection
        const memberDoc = await getDoc(doc(db, "families", lastId, "users", uid));
        if (memberDoc.exists()) {
          foundProfile.role = memberDoc.data().role;
        }
      }

      setAuthUserProfile(foundProfile);
      // Initially, active profile is the logged in user
      setActiveProfile(foundProfile);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  // Sync family location
  useEffect(() => {
    if (!activeFamilyId) return;
    const unsub = onSnapshot(doc(db, "families", activeFamilyId), (docSnap) => {
      if (docSnap.exists() && docSnap.data().location) {
        setFamilyLocation(docSnap.data().location);
      }
    });
    return () => unsub();
  }, [activeFamilyId]);

  const switchFamily = async (id: string) => {
    setActiveFamilyId(id);
    if (user) {
      // Update last active family in global user profile
      updateDoc(doc(db, "users", user.uid), {
        lastActiveFamilyId: id
      });
      // Also update in family subcollection for consistency
      updateDoc(doc(db, "families", id, "users", user.uid), {
        lastActiveFamilyId: id
      });

      // Refresh role for the new family
      const memberDoc = await getDoc(doc(db, "families", id, "users", user.uid));
      if (memberDoc.exists() && authUserProfile) {
        const updatedProfile = { ...authUserProfile, role: memberDoc.data().role, lastActiveFamilyId: id };
        setAuthUserProfile(updatedProfile);
        setActiveProfile(updatedProfile);
      }
    }
  };

  const switchProfile = (profile: UserProfile) => {
    // Neutral profile never requires a PIN
    if (profile.uid === 'neutral') {
      setActiveProfile(profile);
      if (activeFamilyId) {
        localStorage.setItem(`activeProfile_${activeFamilyId}`, profile.uid);
      }
      return;
    }

    // Only parents require a PIN
    if (profile.role === 'parent') {
      setPendingProfile(profile);
      setIsPinDialogOpen(true);
      setPinToVerify("");
    } else {
      setActiveProfile(profile);
      if (activeFamilyId) {
        localStorage.setItem(`activeProfile_${activeFamilyId}`, profile.uid);
      }
    }
  };

  const verifyPin = (codeOverride?: string) => {
    const now = new Date();
    const expectedPin = format(now, "HHmm");
    const code = codeOverride || pinToVerify;

    if (pendingProfile && code === expectedPin) {
      setActiveProfile(pendingProfile);
      if (activeFamilyId) {
        localStorage.setItem(`activeProfile_${activeFamilyId}`, pendingProfile.uid);
      }
      setIsPinDialogOpen(false);
      setPendingProfile(null);
      setPinToVerify("");
      toast.success(`Bienvenue, ${pendingProfile.displayName}`);
    } else {
      toast.error("Code d'accès incorrect. Regardez l'horloge !");
      setPinToVerify("");
    }
  };

  const acceptInvitation = async (invite: Invitation) => {
    if (!user) return;
    try {
      const familyId = invite.familyId;
      
      // Update global user profile
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        familyIds: arrayUnion(familyId),
        lastActiveFamilyId: familyId
      });

      // Add user to family subcollection
      await setDoc(doc(db, "families", familyId, "users", user.uid), {
        uid: user.uid,
        displayName: user.displayName || "Membre",
        email: user.email || "",
        role: invite.role || 'child',
        familyIds: arrayUnion(familyId),
        lastActiveFamilyId: familyId
      });

      // Update invitation status
      await updateDoc(doc(db, "invitations", invite.id), {
        status: 'accepted'
      });

      toast.success("Invitation acceptée !");
      await fetchProfile(user.uid, user.email || "", user.displayName || "");
    } catch (error) {
      console.error("Error accepting invitation:", error);
      toast.error("Erreur lors de l'acceptation");
    }
  };

  const login = async () => {
    setAuthError(null);
    setIsGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      toast.success("Connexion réussie !");
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user') {
        // User closed the popup, no error needed
      } else if (error?.code === 'auth/popup-blocked') {
        const msg = "Le popup de connexion a été bloqué par le navigateur. Autorisez les popups pour ce site.";
        setAuthError(msg);
        toast.error("Popup bloqué");
      } else {
        console.warn("Google auth status:", error?.code || error?.message);
        const msg = error?.message || "Échec de la connexion avec Google.";
        setAuthError(msg);
        toast.error("Échec de la connexion Google");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setAuthError(null);
    setIsAuthLoading(true);

    try {
      if (authMode === 'signup') {
        if (!displayName.trim()) {
          const msg = "Veuillez entrer votre nom complet";
          setAuthError(msg);
          toast.error(msg);
          setIsAuthLoading(false);
          return;
        }
        if (password.length < 6) {
          const msg = "Le mot de passe doit comporter au moins 6 caractères";
          setAuthError(msg);
          toast.error(msg);
          setIsAuthLoading(false);
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
        toast.success("Compte créé avec succès !");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success("Connexion réussie !");
      }
    } catch (error: any) {
      console.warn("Auth status:", error?.code || error?.message);
      const code = error?.code;
      if (code === 'auth/email-already-in-use') {
        const msg = "Cet email est déjà utilisé. Essayez de vous connecter ou utilisez le bouton Google.";
        setAuthError(msg);
        toast.error(msg);
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        const msg = "Email ou mot de passe incorrect. Si vous utilisez un compte Google (@gmail.com), connectez-vous avec Google ci-dessus.";
        setAuthError(msg);
        toast.error("Email ou mot de passe incorrect");
      } else if (code === 'auth/weak-password') {
        const msg = "Le mot de passe est trop faible (minimum 6 caractères).";
        setAuthError(msg);
        toast.error(msg);
      } else if (code === 'auth/operation-not-allowed') {
        const msg = "La connexion par email n'est pas activée sur ce projet. Veuillez vous connecter avec le bouton Google ci-dessus.";
        setAuthError(msg);
        toast.error(msg);
      } else if (code === 'auth/too-many-requests') {
        const msg = "Trop de tentatives infructueuses. Veuillez réessayer plus tard.";
        setAuthError(msg);
        toast.error(msg);
      } else {
        const msg = error?.message || "Une erreur est survenue lors de l'authentification.";
        setAuthError(msg);
        toast.error(msg);
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const [isCreatingFamily, setIsCreatingFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");

  const createFamily = async () => {
    if (!user || !newFamilyName) return;
    try {
      const familyRef = doc(collection(db, "families"));
      const familyId = familyRef.id;
      
      await setDoc(familyRef, {
        name: newFamilyName,
        adminUids: [user.uid],
        createdAt: serverTimestamp()
      });

      // Update global user profile using arrayUnion for atomicity
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        familyIds: arrayUnion(familyId),
        lastActiveFamilyId: familyId
      });
      
      // Also keep the subcollection for backward compatibility/rules
      await setDoc(doc(db, "families", familyId, "users", user.uid), {
        uid: user.uid,
        displayName: user.displayName || "Parent",
        email: user.email || "",
        familyIds: arrayUnion(familyId),
        lastActiveFamilyId: familyId,
        role: 'parent'
      });

      // Update local state
      setFamilies(prev => [...prev, { id: familyId, name: newFamilyName }]);
      setActiveFamilyId(familyId);
      setIsCreatingFamily(false);
      setNewFamilyName("");
      toast.success("Famille créée avec succès !");
      
      // Refresh profile to ensure state is consistent
      await fetchProfile(user.uid, user.email || "", user.displayName || "");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "families");
    }
  };

  const handleFamilyDeleted = (deletedId: string) => {
    setFamilies(prev => prev.filter(f => f.id !== deletedId));
    if (activeFamilyId === deletedId) {
      setActiveFamilyId(null);
      setActiveTab('home');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-950">
        <GlassCard className="max-w-md w-full p-6 sm:p-8">
          <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-blue-500/20">
            <Home className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1.5 tracking-tight text-center text-white">FamilyHub</h1>
          <p className="text-slate-400 mb-6 text-center text-xs sm:text-sm">
            {authMode === 'login' ? 'Connectez-vous pour accéder à votre espace familial.' : 'Créez un compte pour débuter avec votre famille.'}
          </p>

          {/* Primary Action: Google Authentication */}
          <div className="space-y-2 mb-6">
            <Button 
              type="button"
              onClick={login}
              disabled={isGoogleLoading || isAuthLoading}
              className="w-full h-12 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl gap-3 shadow-lg shadow-black/20 transition-all cursor-pointer flex items-center justify-center border-0"
            >
              {isGoogleLoading ? (
                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
              )}
              <span>{isGoogleLoading ? 'Connexion en cours...' : 'Continuer avec Google'}</span>
            </Button>
            <p className="text-[11px] text-center text-slate-400">
              Recommandé pour un accès instantané
            </p>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-[#1e1b4b] px-3 text-slate-400 font-medium rounded-full">Ou avec email</span>
            </div>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold leading-tight">{authError}</p>
                {authError.includes("incorrect") && (
                  <p className="text-slate-300 leading-normal text-[11px]">
                    Astuce : Si vous avez un compte Google (@gmail.com), utilisez le bouton <strong>Continuer avec Google</strong> ci-dessus.
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-3.5 mb-5">
            {authMode === 'signup' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Nom complet</Label>
                <Input 
                  type="text"
                  placeholder="Jean Martin"
                  value={displayName}
                  onChange={(e) => { setDisplayName(e.target.value); setAuthError(null); }}
                  className="bg-white/5 border-white/10 h-11 rounded-xl focus:border-blue-500"
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Email</Label>
              <Input 
                type="email"
                placeholder="jean@famille.fr"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setAuthError(null); }}
                className="bg-white/5 border-white/10 h-11 rounded-xl focus:border-blue-500"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Mot de passe</Label>
              <Input 
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
                className="bg-white/5 border-white/10 h-11 rounded-xl focus:border-blue-500"
                required
              />
            </div>
            <Button 
              type="submit" 
              disabled={isAuthLoading || isGoogleLoading}
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all cursor-pointer"
            >
              {isAuthLoading ? (
                <div className="flex items-center gap-2 justify-center">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Traitement...</span>
                </div>
              ) : (
                authMode === 'login' ? 'Se connecter' : 'Créer un compte'
              )}
            </Button>
          </form>

          <p className="text-center text-xs sm:text-sm text-slate-400">
            {authMode === 'login' ? "Pas encore de compte ?" : "Déjà un compte ?"}
            <button 
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login');
                setAuthError(null);
              }}
              className="ml-2 text-blue-400 font-bold hover:underline cursor-pointer"
            >
              {authMode === 'login' ? "S'inscrire" : "Se connecter"}
            </button>
          </p>
        </GlassCard>
      </div>
    );
  }

  if (families.length === 0 && invitations.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center p-6">
        <GlassCard className="max-w-md w-full text-center">
          <Users className="w-12 h-12 text-blue-400 mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-2">Bienvenue, {user.displayName}</h2>
          <p className="text-slate-400 mb-8">Vous ne faites partie d'aucune famille pour le moment.</p>
          <div className="space-y-4">
            <Dialog open={isCreatingFamily} onOpenChange={setIsCreatingFamily}>
              <DialogTrigger render={
                <Button className="w-full h-12 bg-blue-600 hover:bg-blue-500 rounded-xl gap-2">
                  <Plus className="w-5 h-5" />
                  Créer un groupe familial
                </Button>
              } />
              <DialogContent className="glass-dark border-white/10 text-white">
                <DialogHeader><DialogTitle>Nouveau groupe familial</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid gap-2">
                    <Label>Nom de la famille</Label>
                    <Input 
                      placeholder="ex: Famille Martin" 
                      value={newFamilyName}
                      onChange={e => setNewFamilyName(e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                  <Button onClick={createFamily} className="w-full bg-blue-600">Créer</Button>
                </div>
              </DialogContent>
            </Dialog>
            <p className="text-xs text-slate-500">
              Ou demandez à un parent de vous ajouter via votre email : <br/>
              <span className="font-mono text-blue-400">{user.email}</span>
            </p>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (families.length === 0 && invitations.length > 0) {
    return (
      <div className="h-screen flex items-center justify-center p-6">
        <GlassCard className="max-w-md w-full">
          <h2 className="text-2xl font-bold mb-6 text-center">Invitations en attente</h2>
          <div className="space-y-4">
            {invitations.map(invite => (
              <div key={invite.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="font-bold">{invite.familyName}</div>
                  <div className="text-xs text-slate-400">Invité par {invite.invitedBy}</div>
                </div>
                <Button onClick={() => acceptInvitation(invite)} size="sm" className="bg-blue-600">Accepter</Button>
              </div>
            ))}
            <div className="pt-4 border-t border-white/5">
              <Button onClick={createFamily} variant="ghost" className="w-full text-slate-400">Ou créer votre propre famille</Button>
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  const navItems = [
    { id: 'home', label: 'Accueil', icon: <Home className="w-5 h-5" /> },
    { id: 'calendar', label: 'Planning', icon: <Calendar className="w-5 h-5" /> },
    { id: 'shopping', label: 'Courses', icon: <ShoppingCart className="w-5 h-5" /> },
    { id: 'todos', label: 'Tâches', icon: <CheckCircle className="w-5 h-5" /> },
    { id: 'users', label: 'Utilisateurs', icon: <Users className="w-5 h-5" /> },
    { id: 'admin', label: 'Famille', icon: <Settings className="w-5 h-5" />, minRole: 'parent' },
  ];

  const activeFamilyName = families.find(f => f.id === activeFamilyId)?.name || "Ma Famille";

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <Toaster position="top-center" />
      
      {/* Header */}
      <header className="w-full px-3 pt-3 sm:px-6 sm:pt-4 lg:px-8 mb-2 sm:mb-4">
        <div className="flex items-center justify-between gap-2 sm:gap-4 px-3.5 py-2.5 sm:px-6 sm:py-3.5 glass-header rounded-2xl sm:rounded-[2rem] border-white/15 shadow-xl">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-white/20 shadow-lg shrink-0">
              <img 
                src={activeProfile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeProfile?.displayName}`} 
                alt={activeProfile?.displayName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base sm:text-xl tracking-tight text-white leading-tight truncate max-w-[120px] sm:max-w-[220px] md:max-w-none">
                {activeFamilyName}
              </span>
              <span className="text-[9px] font-bold tracking-[0.12em] text-white/45 uppercase truncate">
                {activeProfile?.displayName} · {activeProfile?.role === 'parent' ? 'Parent' : 'Membre'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 shrink-0">
            {/* Real-time Weather popup trigger */}
            <HeaderWeather city={familyLocation} />

            <div className="w-px h-6 sm:h-8 bg-white/20 hidden sm:block" />

            <div className="flex items-center gap-3 sm:gap-5">
              <span className="text-xl sm:text-3xl lg:text-4xl font-normal tracking-tight text-white tabular-nums drop-shadow-md">
                {format(currentTime, "HH:mm")}
              </span>
              <div className="w-px h-8 bg-white/20 hidden md:block" />
              <div className="hidden md:flex flex-col">
                <span className="text-[10px] font-black tracking-[0.2em] text-[#fee29a] uppercase">
                  {format(currentTime, "EEEE", { locale: fr })}
                </span>
                <span className="text-[10px] font-medium tracking-[0.05em] text-white/45 uppercase">
                  {format(currentTime, "d MMMM", { locale: fr })}
                </span>
              </div>
            </div>
            
            <button 
              type="button"
              onClick={() => signOut(auth)}
              aria-label="Se déconnecter"
              title="Se déconnecter"
              className="w-9 h-9 sm:w-11 sm:h-11 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl transition-all group flex items-center justify-center shadow-lg active:scale-95 cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5 text-white group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-24 overflow-y-auto">
        <div className="w-full px-3 py-3 sm:px-6 sm:py-5 lg:px-10">
          {activeFamilyId && activeProfile && (
            <>
              {activeTab === 'home' && (
                <Dashboard 
                  user={activeProfile} 
                  familyId={activeFamilyId} 
                  members={familyMembers}
                  initialLayout={activeProfile.dashboardLayout}
                  familyLocation={familyLocation}
                  onTabSwitch={(tab: any) => setActiveTab(tab)}
                />
              )}

              {activeTab === 'calendar' && (
                <GlassCard className="min-h-[600px]">
                  <FamilyCalendar familyId={activeFamilyId} user={activeProfile} />
                </GlassCard>
              )}

              {activeTab === 'shopping' && (
                <GlassCard className="min-h-[600px]">
                  <ShoppingList familyId={activeFamilyId} user={activeProfile} />
                </GlassCard>
              )}

              {activeTab === 'todos' && (
                <GlassCard className="min-h-[600px]">
                  <TodoList familyId={activeFamilyId} user={activeProfile} members={familyMembers} />
                </GlassCard>
              )}

              {activeTab === 'admin' && (
                <div className="space-y-6">
                  {invitations.length > 0 && (
                    <GlassCard className="border-blue-500/30">
                      <h3 className="font-bold mb-4 flex items-center gap-2">
                        <Mail className="w-5 h-5 text-blue-400" />
                        Invitations en attente
                      </h3>
                      <div className="space-y-3">
                        {invitations.map(invite => (
                          <div key={invite.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                            <div>
                              <div className="font-bold">{invite.familyName}</div>
                              <div className="text-xs text-slate-400">Invité par {invite.invitedBy}</div>
                            </div>
                            <Button onClick={() => acceptInvitation(invite)} size="sm" className="bg-blue-600">Accepter</Button>
                          </div>
                        ))}
                      </div>
                    </GlassCard>
                  )}
                  {activeProfile.role === 'parent' && (
                    <GlassCard className="min-h-[600px]">
                      <FamilyAdmin 
                        familyId={activeFamilyId} 
                        currentUser={activeProfile} 
                        onFamilyDeleted={handleFamilyDeleted}
                      />
                    </GlassCard>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Bottom Navigation */}
      {activeFamilyId && activeProfile && (
        <nav aria-label="Navigation principale" className="fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 w-[94%] sm:w-[90%] max-w-lg glass-dark border border-white/10 rounded-2xl sm:rounded-3xl h-16 px-1.5 sm:px-3 shadow-2xl z-50 flex items-center justify-around overflow-hidden">
          {navItems.map((item) => (
            (!item.minRole || activeProfile?.role === item.minRole) && (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'users') {
                    setIsUsersOpen(true);
                  } else {
                    setActiveTab(item.id as any);
                  }
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 rounded-2xl min-h-[44px] min-w-[44px] transition-all duration-200 group relative cursor-pointer shrink-0",
                  activeTab === item.id 
                    ? "text-blue-400" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <div className={cn(
                  "p-1 sm:p-1.5 rounded-xl transition-all",
                  activeTab === item.id ? "bg-blue-500/15" : "group-hover:bg-white/5"
                )}>
                  {item.icon}
                </div>
                <span className="text-[10px] font-bold tracking-tight whitespace-nowrap opacity-90">{item.label}</span>
                {activeTab === item.id && (
                  <motion.div 
                    layoutId="activeTabIcon"
                    className="absolute -top-0.5 w-4 h-0.5 bg-blue-400 rounded-full"
                  />
                )}
              </button>
            )
          ))}
        </nav>
      )}

      {/* Profile/User Selector Modal */}
      <Dialog open={isUsersOpen} onOpenChange={setIsUsersOpen}>
        <DialogContent className="glass-dark border-white/10 text-white max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center font-bold text-xl">Membres de la famille</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-8">
            {familyMembers.map((member) => (
              <button
                key={member.uid}
                onClick={() => { switchProfile(member); setIsUsersOpen(false); }}
                className={cn(
                  "flex flex-col items-center gap-3 p-6 rounded-3xl transition-all relative overflow-hidden group",
                  activeProfile?.uid === member.uid 
                    ? "bg-blue-500/20 border border-blue-500/40" 
                    : "bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10"
                )}
              >
                <div className={cn(
                  "w-20 h-20 rounded-full p-1.5 transition-all group-hover:scale-105",
                  activeProfile?.uid === member.uid ? "bg-blue-500 shadow-lg shadow-blue-500/30" : "bg-white/10"
                )}>
                  <div className="w-full h-full rounded-full overflow-hidden border-2 border-slate-900">
                    <img 
                      src={member.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.displayName}`} 
                      alt={member.displayName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-sm tracking-tight">{member.displayName}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">{member.role}</div>
                </div>
                {activeProfile?.uid === member.uid && (
                  <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
          <div className="flex justify-center pt-4 border-t border-white/5">
            <button
              onClick={() => { signOut(auth); setIsUsersOpen(false); }}
              className="flex items-center gap-2 px-6 py-2 rounded-2xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              Se déconnecter
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIN Dialog */}
      <Dialog open={isPinDialogOpen} onOpenChange={setIsPinDialogOpen}>
        <DialogContent className="glass-dark border-white/10 text-white max-w-[300px]">
          <DialogHeader>
            <DialogTitle className="text-center">Code d'accès requis</DialogTitle>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-blue-500/50">
              <img 
                src={pendingProfile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${pendingProfile?.displayName}`} 
                alt={pendingProfile?.displayName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="text-center">
              <div className="font-bold">{pendingProfile?.displayName}</div>
              <div className="text-xs text-slate-500">Profil Parent</div>
              <div className="text-[10px] text-blue-400 font-bold mt-2 uppercase tracking-tight">Code dynamique requis</div>
            </div>
            <Input 
              type="password"
              maxLength={4}
              value={pinToVerify}
              readOnly
              className="text-center text-3xl tracking-[0.5em] bg-white/5 border-white/10 h-16 font-bold"
            />
            
            <div className="grid grid-cols-3 gap-3 w-full">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => {
                    if (pinToVerify.length < 4) {
                      const newVal = pinToVerify + num;
                      setPinToVerify(newVal);
                      if (newVal.length === 4) verifyPin(newVal);
                    }
                  }}
                  className="h-14 rounded-2xl bg-white/5 border border-white/10 text-xl font-bold hover:bg-white/10 active:bg-blue-500/20 active:border-blue-500/40 transition-all"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => setPinToVerify("")}
                className="h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/20 transition-all"
              >
                C
              </button>
              <button
                onClick={() => {
                  if (pinToVerify.length < 4) {
                    const newVal = pinToVerify + "0";
                    setPinToVerify(newVal);
                    if (newVal.length === 4) verifyPin(newVal);
                  }
                }}
                className="h-14 rounded-2xl bg-white/5 border border-white/10 text-xl font-bold hover:bg-white/10 active:bg-blue-500/20 active:border-blue-500/40 transition-all"
              >
                0
              </button>
              <button
                onClick={() => setPinToVerify(prev => prev.slice(0, -1))}
                className="h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all"
              >
                <Delete className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <Button onClick={() => verifyPin()} className="w-full h-12 bg-blue-600 hover:bg-blue-500 font-bold rounded-xl mt-2">
              Déverrouiller
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        .vertical-text {
          writing-mode: vertical-rl;
          text-orientation: mixed;
          transform: rotate(180deg);
        }
      `}</style>

      {activeFamilyId && activeProfile && familyMembers.length > 0 && (
        <FamilyAssistant 
          familyId={activeFamilyId} 
          user={activeProfile} 
          members={familyMembers} 
        />
      )}
    </div>
  );
}
