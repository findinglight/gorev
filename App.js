import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { CheckCircle, Star, Award, BookOpen, Smile, BrainCircuit, Plus, Trash2, Users, Settings, AlertTriangle, ShieldCheck } from 'lucide-react';

// --- Firebase Konfigürasyonu ---
// DEĞİŞİKLİK: Kullanıcının sağladığı Firebase bilgileri eklendi.
const firebaseConfig = {
    apiKey: "AIzaSyCq0cVlW_edwAROUXfKceC2rJzFps_wRFM",
    authDomain: "gorev-39d45.firebaseapp.com",
    projectId: "gorev-39d45",
    storageBucket: "gorev-39d45.firebasestorage.app",
    messagingSenderId: "340635577706",
    appId: "1:340635577706:web:17b8864987b6d070990913",
    measurementId: "G-WS9NKLTKV1"
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'topuz-ailesi-gorev-macerasi';

// --- Firebase Servislerini Başlatma ---
let app, auth, db;
try {
    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    }
} catch (e) {
    console.error("Firebase başlatma hatası:", e);
}

// --- Yardımcı Fonksiyonlar ---
const getTodayDateString = () => new Date(new Date().getTime() - (new Date().getTimezoneOffset()*60*1000)).toISOString().split('T')[0];
const getFormattedDateTR = () => new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// --- Ana Uygulama Komponenti ---
export default function App() {
    const [appData, setAppData] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!app) {
            setError("Firebase yapılandırması bulunamadı veya hatalı.");
            setLoading(false);
        }
    }, []);

    const dataDocRef = useMemo(() => {
        if (!db) return null;
        return doc(db, 'artifacts', appId, 'public', 'data', 'gorevMacerasi', 'main');
    }, [appId]);

    useEffect(() => {
        if (!auth) {
            if (!error) setLoading(false);
            return;
        }

        const authSub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try {
                    await signInAnonymously(auth);
                } catch (authError) {
                    setError("Firebase oturumu açılamadı. Yapılandırmanızı kontrol edin.");
                    setLoading(false);
                }
            } else {
                 if (!dataDocRef) return;
                 const unsub = onSnapshot(dataDocRef, (docSnap) => {
                    if (docSnap.exists()) {
                        setAppData(docSnap.data());
                    } else {
                        const initialData = {
                            users: [],
                            tasks: [
                                { id: 'task1', text: 'Kitap oku', icon: 'BookOpen', points: 1 },
                                { id: 'task2', text: 'Diş fırçala', icon: 'Smile', points: 1 }
                            ],
                            completions: {},
                            weeklyReward: 'Hafta sonu sinema keyfi!',
                        };
                        setDoc(dataDocRef, initialData).then(() => setAppData(initialData));
                    }
                    setLoading(false);
                }, (firestoreError) => {
                    setError("Veri alınırken hata oluştu: " + firestoreError.message);
                    setLoading(false);
                });
                return () => unsub();
            }
        });
        return () => authSub();
    }, [dataDocRef, error]);

    const updateFirestore = async (newData) => {
        if (!dataDocRef) return;
        try {
            await setDoc(dataDocRef, { ...(appData || {}), ...newData }, { merge: true });
        } catch (updateError) {
            setError("Veri kaydedilemedi.");
        }
    };
    
    const addUser = (name) => {
        const newUser = { id: `user_${Date.now()}`, name, points: 0 };
        const updatedUsers = [...(appData?.users || []), newUser];
        updateFirestore({ users: updatedUsers });
    };

    const addTask = (text, points) => {
        const newTask = { id: `task_${Date.now()}`, text, icon: 'CheckCircle', points };
        const updatedTasks = [...(appData?.tasks || []), newTask];
        updateFirestore({ tasks: updatedTasks });
    };

    const deleteTask = (taskId) => {
        const updatedTasks = (appData?.tasks || []).filter(t => t.id !== taskId);
        updateFirestore({ tasks: updatedTasks });
    };

    const toggleTaskCompletion = (task) => {
        if (currentUser.isAdmin) return;
        const today = getTodayDateString();
        const completions = JSON.parse(JSON.stringify(appData.completions || {}));
        
        if (!completions[today]) completions[today] = {};
        if (!completions[today][currentUser.id]) completions[today][currentUser.id] = [];

        const userCompletionsToday = completions[today][currentUser.id];
        const taskIndex = userCompletionsToday.indexOf(task.id);
        const pointsChange = task.points || 1;
        
        if (taskIndex > -1) {
            userCompletionsToday.splice(taskIndex, 1);
        } else {
            userCompletionsToday.push(task.id);
        }
        
        const updatedUsers = appData.users.map(u => {
            if (u.id === currentUser.id) {
                const currentPoints = u.points || 0;
                const newPoints = taskIndex > -1 ? currentPoints - pointsChange : currentPoints + pointsChange;
                return { ...u, points: Math.max(0, newPoints) };
            }
            return u;
        });

        updateFirestore({ completions, users: updatedUsers });
    };
    
    const updateWeeklyReward = (newReward) => {
        updateFirestore({ weeklyReward: newReward });
    };

    if (loading) return <div className="flex items-center justify-center h-screen bg-bl
