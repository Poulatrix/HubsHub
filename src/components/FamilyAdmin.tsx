import { useState, useEffect } from "react";
import { db, OperationType, handleFirestoreError } from "@/lib/firebase";
import { collection, onSnapshot, doc, deleteDoc, updateDoc, getDoc, addDoc, serverTimestamp, query, where, arrayRemove, setDoc } from "firebase/firestore";
import { Users, UserPlus, Shield, Trash2, Mail, Clock, AlertTriangle, Plus, Edit2, Upload, Camera, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn, handleFileUpload } from "@/lib/utils";
import { subscribeToPush, sendTestNotification } from "@/lib/pushNotifications";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

interface FamilyMember {
  id: string;
  uid: string;
  displayName: string;
  email?: string;
  role: 'parent' | 'child';
  photoURL?: string;
  pin?: string;
}

interface Invitation {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined';
  role: string;
}

export function FamilyAdmin({ familyId, currentUser, onFamilyDeleted }: { familyId: string, currentUser: any, onFamilyDeleted?: (id: string) => void }) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPin, setNewMemberPin] = useState("");
  const [newMemberPhoto, setNewMemberPhoto] = useState("");
  const [inviteRole, setInviteRole] = useState<'parent' | 'child'>('child');
  const [familyName, setFamilyName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhoto, setEditPhoto] = useState("");
  const [editPin, setEditPin] = useState("");
  const [familyLoc, setFamilyLoc] = useState("");

  useEffect(() => {
    if (!familyId) return;

    const membersUnsubscribe = onSnapshot(collection(db, "families", familyId, "users"), (snapshot) => {
      setMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FamilyMember)));
    });

    const fetchFamilyData = async () => {
      const fDoc = await getDoc(doc(db, "families", familyId));
      if (fDoc.exists()) {
        setFamilyName(fDoc.data().name);
        setFamilyLoc(fDoc.data().location || "");
      }
    };
    fetchFamilyData();

    return () => {
      membersUnsubscribe();
    };
  }, [familyId]);

  const deleteFamily = async () => {
    try {
      // 1. Remove familyId from all members' global user profiles
      for (const member of members) {
        try {
          await updateDoc(doc(db, "users", member.uid), {
            familyIds: arrayRemove(familyId)
          });
        } catch (e) {
          console.error(`Could not update global profile for user ${member.uid}`, e);
        }
      }

      // 2. Delete the family document
      await deleteDoc(doc(db, "families", familyId));
      
      toast.success("Groupe familial supprimé");
      if (onFamilyDeleted) onFamilyDeleted(familyId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `families/${familyId}`);
    }
  };

  const createMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName) return;

    try {
      const memberUid = `managed-${Date.now()}`;
      const memberData: any = {
        uid: memberUid,
        displayName: newMemberName,
        role: inviteRole,
        photoURL: newMemberPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${newMemberName}`,
        familyIds: [familyId],
        lastActiveFamilyId: familyId,
        isManaged: true
      };

      if (inviteRole === 'parent' && newMemberPin) {
        memberData.pin = newMemberPin;
      }

      await setDoc(doc(db, "families", familyId, "users", memberUid), memberData);

      // If it's a parent, also add to adminUids in family doc
      if (inviteRole === 'parent') {
        const familyRef = doc(db, "families", familyId);
        const familyDoc = await getDoc(familyRef);
        if (familyDoc.exists()) {
          const adminUids = familyDoc.data().adminUids || [];
          if (!adminUids.includes(memberUid)) {
            await updateDoc(familyRef, {
              adminUids: [...adminUids, memberUid]
            });
          }
        }
      }

      setNewMemberName("");
      setNewMemberPin("");
      setNewMemberPhoto("");
      toast.success("Membre créé avec succès !");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `families/${familyId}/users`);
    }
  };

  const cancelInvite = async (id: string) => {
    try {
      await deleteDoc(doc(db, "invitations", id));
      toast.success("Invitation annulée");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invitations/${id}`);
    }
  };

  const updateRole = async (memberId: string, newRole: 'parent' | 'child') => {
    try {
      await updateDoc(doc(db, "families", familyId, "users", memberId), { role: newRole });
      
      // Also update adminUids in family doc
      const familyRef = doc(db, "families", familyId);
      const familyDoc = await getDoc(familyRef);
      if (familyDoc.exists()) {
        let adminUids = familyDoc.data().adminUids || [];
        if (newRole === 'parent') {
          if (!adminUids.includes(memberId)) adminUids.push(memberId);
        } else {
          adminUids = adminUids.filter((uid: string) => uid !== memberId);
        }
        await updateDoc(familyRef, { adminUids });
      }
      
      toast.success("Rôle mis à jour");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `families/${familyId}/users/${memberId}`);
    }
  };

  const removeMember = async (memberId: string) => {
    if (memberId === currentUser.uid) {
      toast.error("Vous ne pouvez pas vous retirer vous-même");
      return;
    }
    try {
      await deleteDoc(doc(db, "families", familyId, "users", memberId));
      toast.success("Membre retiré");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `families/${familyId}/users/${memberId}`);
    }
  };

  const startEditing = (member: FamilyMember) => {
    setEditingMember(member);
    setEditName(member.displayName);
    setEditPhoto(member.photoURL || "");
    setEditPin(member.pin || "");
  };

  const saveEdit = async () => {
    if (!editingMember) return;
    try {
      const updates: any = {
        displayName: editName,
        photoURL: editPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${editName}`
      };
      if (editingMember.role === 'parent') {
        updates.pin = editPin;
      }

      await updateDoc(doc(db, "families", familyId, "users", editingMember.uid), updates);
      
      // Also update global user profile if it's not a managed user (real user)
      if (!editingMember.uid.startsWith('managed-')) {
        await updateDoc(doc(db, "users", editingMember.uid), updates);
      }

      setEditingMember(null);
      toast.success("Profil mis à jour");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `families/${familyId}/users/${editingMember.uid}`);
    }
  };

  return (
    <div className="space-y-8 p-2">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-400" />
          Gestion de {familyName}
        </h2>
        
        <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
          <DialogTrigger render={
            <Button variant="ghost" className="text-red-400 hover:bg-red-400/10 gap-2">
              <Trash2 className="w-4 h-4" />
              Supprimer le groupe
            </Button>
          } />
          <DialogContent className="glass-dark border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-5 h-5" />
                Supprimer le groupe ?
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <p className="text-slate-300">
                Cette action est irréversible. Toutes les données liées à ce groupe (planning, courses, messages) seront définitivement supprimées.
              </p>
              <p className="text-sm text-slate-500 italic">
                Note: Les membres seront retirés de ce groupe mais garderont leur compte FamilyHub.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setIsDeleting(false)}>Annuler</Button>
              <Button variant="destructive" onClick={deleteFamily} className="bg-red-600 hover:bg-red-500">
                Confirmer la suppression
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Member Section */}
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-400" />
              Créer un membre
            </h3>
            <form onSubmit={createMember} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 uppercase font-bold">Nom du membre</label>
                <Input 
                  placeholder="ex: Julie" 
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  className="bg-white/5 border-white/10"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-400 uppercase font-bold">Rôle</label>
                <div className="flex gap-2">
                  <Button 
                    type="button"
                    variant={inviteRole === 'child' ? 'default' : 'outline'}
                    onClick={() => setInviteRole('child')}
                    className="flex-1 rounded-xl"
                  >
                    Enfant
                  </Button>
                  <Button 
                    type="button"
                    variant={inviteRole === 'parent' ? 'default' : 'outline'}
                    onClick={() => setInviteRole('parent')}
                    className="flex-1 rounded-xl"
                  >
                    Parent
                  </Button>
                </div>
              </div>
              {inviteRole === 'parent' && (
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 uppercase font-bold">Code d'accès (4 chiffres)</label>
                  <Input 
                    type="password"
                    maxLength={4}
                    placeholder="1234" 
                    value={newMemberPin}
                    onChange={e => setNewMemberPin(e.target.value.replace(/\D/g, ''))}
                    className="bg-white/5 border-white/10"
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs text-slate-400 uppercase font-bold">URL Photo (Optionnel)</label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="https://..." 
                    value={newMemberPhoto}
                    onChange={e => setNewMemberPhoto(e.target.value)}
                    className="bg-white/5 border-white/10 flex-1"
                  />
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handleFileUpload(e, setNewMemberPhoto)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Button type="button" variant="outline" size="icon" className="bg-white/5 border-white/10">
                      <Upload className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {newMemberPhoto && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10">
                      <img src={newMemberPhoto} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setNewMemberPhoto("")} className="text-xs text-red-400">Supprimer</Button>
                  </div>
                )}
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-xl gap-2">
                <Plus className="w-4 h-4" />
                Créer le membre
              </Button>
            </form>
          </div>
        </div>

        {/* Members List */}
        <div className="space-y-8">
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
            <h3 className="text-lg font-semibold mb-6">Membres actuels</h3>
            <div className="space-y-4">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 glass-hover group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10">
                      <img 
                        src={member.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.displayName}`} 
                        alt={member.displayName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {member.displayName}
                        {member.role === 'parent' && <Shield className="w-3 h-3 text-amber-400" />}
                      </div>
                      <div className="text-xs text-slate-500">{member.role}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Dialog open={!!editingMember && editingMember.id === member.id} onOpenChange={(open) => !open && setEditingMember(null)}>
                      <DialogTrigger render={
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => startEditing(member)}
                          className="text-slate-400 hover:text-white"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      } />
                      <DialogContent className="glass-dark border-white/10 text-white">
                        <DialogHeader><DialogTitle>Modifier le profil</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="flex flex-col items-center gap-4 mb-4">
                            <div className="relative group">
                              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-blue-500/50">
                                <img 
                                  src={editPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${editName}`} 
                                  alt="Preview" 
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer">
                                <Camera className="w-6 h-6 text-white" />
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={(e) => handleFileUpload(e, setEditPhoto)}
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                              </div>
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold">Cliquez pour changer la photo</div>
                          </div>

                          <div className="space-y-2">
                            <Label>Nom d'affichage</Label>
                            <Input 
                              value={editName} 
                              onChange={e => setEditName(e.target.value)} 
                              className="bg-white/5 border-white/10"
                            />
                          </div>

                          {member.role === 'parent' && (
                            <div className="space-y-2">
                              <Label>Code d'accès (PIN)</Label>
                              <Input 
                                type="password"
                                maxLength={4}
                                value={editPin} 
                                onChange={e => setEditPin(e.target.value.replace(/\D/g, ''))} 
                                className="bg-white/5 border-white/10"
                              />
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label>Lien photo direct (URL)</Label>
                            <Input 
                              value={editPhoto} 
                              onChange={e => setEditPhoto(e.target.value)} 
                              placeholder="https://..."
                              className="bg-white/5 border-white/10"
                            />
                          </div>

                          <Button onClick={saveEdit} className="w-full bg-blue-600">Enregistrer les modifications</Button>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {member.uid !== currentUser.uid && (
                      <>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => updateRole(member.id, member.role === 'parent' ? 'child' : 'parent')}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          {member.role === 'parent' ? 'Rétrograder' : 'Promouvoir'}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeMember(member.id)}
                          className="text-red-400 hover:bg-red-400/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
            <h3 className="text-lg font-semibold mb-4">Paramètres du groupe</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Localisation (Météo pour toute la famille)</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="ex: Paris, FR" 
                    value={familyLoc}
                    onChange={e => setFamilyLoc(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                  <Button 
                    onClick={async () => {
                      try {
                        await updateDoc(doc(db, "families", familyId), { location: familyLoc });
                        toast.success("Localisation mise à jour");
                      } catch (e) {
                        toast.error("Erreur mise à jour");
                      }
                    }}
                    className="bg-blue-600"
                  >
                    Valider
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-400" />
              Notifications Push
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Activez les notifications pour recevoir les alertes de votre famille sur cet appareil.
            </p>
            <div className="flex gap-2">
              <Button 
                onClick={async () => {
                  const subscription = await subscribeToPush();
                  if (subscription) {
                    try {
                      // Save subscription to the current family member profile in Firestore
                      const memberId = members.find(m => m.uid === currentUser.uid)?.id;
                      if (memberId) {
                        await updateDoc(doc(db, "families", familyId, "users", memberId), {
                          pushSubscription: JSON.parse(JSON.stringify(subscription))
                        });
                        toast.success("Notifications activées !");
                      }
                    } catch (e) {
                      console.error("Error saving subscription:", e);
                      toast.error("Erreur lors de l'enregistrement de l'abonnement");
                    }
                  }
                }}
                className="bg-blue-600 flex-1"
              >
                Activer sur cet appareil
              </Button>
              <Button 
                variant="outline"
                onClick={async () => {
                  const registration = await navigator.serviceWorker.ready;
                  const subscription = await registration.pushManager.getSubscription();
                  if (subscription) {
                    await sendTestNotification(subscription);
                    toast.info("Notification de test envoyée");
                  } else {
                    toast.error("Veuillez d'abord activer les notifications");
                  }
                }}
                className="border-white/10 text-white"
              >
                Tester
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
