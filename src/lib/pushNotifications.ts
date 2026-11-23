import { toast } from "sonner";

export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('Service Worker registered with scope:', registration.scope);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
}

export async function subscribeToPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check for existing subscription
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) return existingSubscription;

    // Get public key from server
    const response = await fetch('/api/vapid-public-key');
    const { publicKey } = await response.json();

    if (!publicKey) {
      console.error('Public key not found');
      return null;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    console.log('User is subscribed:', subscription);
    return subscription;
  } catch (error) {
    console.error('Failed to subscribe user:', error);
    if (Notification.permission === 'denied') {
      toast.error("Les notifications sont bloquées. Veuillez les activer dans les paramètres de votre navigateur.");
    }
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function sendTestNotification(subscription: any) {
  try {
    await fetch('/api/send-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subscription,
        payload: {
          title: 'FamilyHub',
          body: 'Ceci est une notification de test !',
          url: '/'
        }
      })
    });
  } catch (error) {
    console.error('Failed to send test notification:', error);
  }
}

export async function notifyFamily(familyId: string, currentUserId: string, title: string, body: string, url: string = '/') {
  try {
    // 1. Fetch all members with subscriptions
    const { collection, getDocs } = await import("firebase/firestore");
    const { db } = await import("./firebase");
    const membersSnap = await getDocs(collection(db, "families", familyId, "users"));
    
    const subscriptions = membersSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(m => m.uid !== currentUserId && m.pushSubscription)
      .map(m => m.pushSubscription);

    if (subscriptions.length === 0) return;

    // 2. Send to each subscription via our API
    await Promise.all(subscriptions.map(sub => 
      fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub,
          payload: { title, body, url }
        })
      })
    ));
  } catch (error) {
    console.error("Error notifying family:", error);
  }
}
