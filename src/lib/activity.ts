import { db } from "./firebase";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "firebase/firestore";

export type ActivityType = "shopping" | "task" | "calendar" | "wall" | "profile";
export type ActivityAction = "create" | "update" | "delete" | "complete" | "join";

export interface Activity {
  id?: string;
  familyId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  type: ActivityType;
  action: ActivityAction;
  details: string;
  timestamp: any;
}

export const logActivity = async (activity: Omit<Activity, "timestamp">) => {
  try {
    await addDoc(collection(db, "families", activity.familyId, "activities"), {
      ...activity,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};
