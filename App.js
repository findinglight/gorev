import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { CheckCircle, Star, Award, BookOpen, Smile, BrainCircuit, Plus, Trash2, Users, Settings, AlertTriangle, ShieldCheck } from 'lucide-react';

// --- Firebase Konfigürasyonu ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'topuz-ailesi-gorev-macerasi';

// --- Firebase Servislerini Başlatma ---
let app, auth, db;
try {
    if (Object.keys(firebaseConfig).length > 0) {
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
            setError("Firebase yapılandırması bulunamadı. Uygulama başlatılamıyor.");
            setLoading(false);
        }
    }, []);

    const dataDocRef = useMemo(() => {
        if (!db) return null;
        return doc(db, 'artifacts', appId, 'public', 'data', 'gorevMacerasi', 'main');
    }, []);

    useEffect(() => {
        if (!dataDocRef) {
            if (db) setLoading(false);
            return;
        }

        const authSub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try {
                    await signInAnonymously(auth);
                } catch (authError) {
                    setError("Oturum açılamadı.");
                    setLoading(false);
                }
            } else {
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
                    setError("Veri alınırken hata oluştu.");
                    setLoading(false);
                });
                return () => unsub();
            }
        });
        return () => authSub();
    }, [dataDocRef]);

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

    if (loading) return <div className="flex items-center justify-center h-screen bg-blue-50 text-blue-700 font-semibold">Yükleniyor...</div>;
    if (error) return <ErrorScreen message={error} />;
    if (!appData) return <div className="flex items-center justify-center h-screen bg-blue-50">Veriler hazırlanıyor...</div>;
    if (!currentUser) return <UserSelectionScreen users={appData.users || []} onSelectUser={setCurrentUser} onAddUser={addUser} />;
    
    return (
        <Dashboard 
            user={currentUser}
            appData={appData}
            onToggleTask={toggleTaskCompletion}
            onAddTask={addTask}
            onDeleteTask={deleteTask}
            onUpdateReward={updateWeeklyReward}
            onSwitchUser={() => setCurrentUser(null)}
        />
    );
}

// --- Komponentler ---
function UserSelectionScreen({ users, onSelectUser, onAddUser }) {
    const [newUserName, setNewUserName] = useState('');
    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const handleAddUser = e => { e.preventDefault(); if (newUserName.trim()) { onAddUser(newUserName.trim()); setNewUserName(''); }};
    if (showAdminLogin) return <AdminLoginModal onLogin={onSelectUser} onCancel={() => setShowAdminLogin(false)} />;
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-200 to-cyan-200 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 text-center">
                <Users className="mx-auto h-16 w-16 text-blue-500 mb-4" />
                <h1 className="text-3xl font-bold text-slate-800 mb-2">Topuz Ailesi Görev Macerası</h1>
                <p className="text-slate-600 mb-8">Kim Oynuyor?</p>
                <div className="space-y-3 mb-6">
                    {(users || []).map(user => (
                        <button key={user.id} onClick={() => onSelectUser(user)} className="w-full text-left p-4 bg-white rounded-lg shadow-md hover:bg-blue-100 hover:shadow-lg transition-all flex items-center justify-between">
                            <div className="flex items-center">
                                <span className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center text-lg mr-4">{user.name.charAt(0)}</span>
                                <span className="text-xl font-semibold text-slate-700">{user.name}</span>
                            </div>
                            <div className="flex items-center gap-1 text-yellow-600 font-semibold pr-2"><Star className="w-5 h-5 text-yellow-500" /><span>{user.points || 0}</span></div>
                        </button>
                    ))}
                </div>
                <form onSubmit={handleAddUser} className="flex gap-2 mb-4">
                    <input type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Yeni Maceracı Ekle" className="flex-grow p-3 border-2 border-slate-300 rounded-lg" />
                    <button type="submit" className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus /></button>
                </form>
                <button onClick={() => setShowAdminLogin(true)} className="text-sm text-slate-500 hover:text-blue-600">Yönetici Girişi</button>
            </div>
        </div>
    );
};

function AdminLoginModal({ onLogin, onCancel }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const handleSubmit = e => { e.preventDefault(); if (password.toUpperCase() === "ADMIN") onLogin({ id: 'admin', name: 'Yönetici', isAdmin: true, points: '∞' }); else { setError('Hatalı şifre!'); setPassword(''); }};
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl p-8 text-center w-full max-w-sm">
                <ShieldCheck className="mx-auto h-16 w-16 text-blue-500 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Yönetici Girişi</h2>
                <form onSubmit={handleSubmit}>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Yönetici Şifresi" className="w-full p-3 border-2 border-slate-300 rounded-lg" />
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                    <div className="flex gap-3 mt-6">
                        <button type="button" onClick={onCancel} className="flex-1 p-3 bg-slate-200 text-slate-700 rounded-lg">İptal</button>
                        <button type="submit" className="flex-1 p-3 bg-blue-600 text-white rounded-lg">Giriş Yap</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

function Dashboard({ user, appData, onToggleTask, onAddTask, onDeleteTask, onUpdateReward, onSwitchUser }) {
    const displayedUser = useMemo(() => appData?.users?.find(u => u.id === user.id) || user, [appData?.users, user.id]);
    const isUserAdmin = user.isAdmin || false;
    const [manageMode, setManageMode] = useState(isUserAdmin);

    return (
        <div className="bg-slate-50 min-h-screen font-sans">
            <div className="container mx-auto p-4 max-w-4xl">
                <header className="flex justify-between items-center mb-6">
                    <div><h1 className="text-4xl font-bold text-slate-800 flex items-center gap-2">{displayedUser.name}{isUserAdmin && <ShieldCheck className="w-8 h-8 text-blue-500" />}</h1></div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-yellow-100 text-yellow-800 font-bold py-2 px-4 rounded-full"><Star className="w-6 h-6 text-yellow-500" /><span>{displayedUser?.points || 0}</span></div>
                        {isUserAdmin && <button onClick={() => setManageMode(!manageMode)} className={`p-3 rounded-full transition ${manageMode ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'}`}><Settings /></button>}
                        <button onClick={onSwitchUser} className="p-3 bg-slate-200 text-slate-600 rounded-full hover:bg-slate-300"><Users /></button>
                    </div>
                </header>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2"><TaskList user={displayedUser} tasks={appData.tasks} completions={appData.completions} onToggleTask={onToggleTask} onAddTask={onAddTask} onDeleteTask={onDeleteTask} manageMode={manageMode} isAdmin={isUserAdmin} /></div>
                    <div><WeeklyRewardPanel user={displayedUser} tasks={appData.tasks} completions={appData.completions} reward={appData.weeklyReward} onUpdateReward={onUpdateReward} manageMode={manageMode} /></div>
                </div>
            </div>
        </div>
    );
};

function TaskList({ user, tasks, completions, onToggleTask, onAddTask, onDeleteTask, manageMode, isAdmin }) {
    const [newTaskText, setNewTaskText] = useState('');
    const [newTaskPoints, setNewTaskPoints] = useState(1);
    const today = getTodayDateString();
    const handleAddTask = e => { e.preventDefault(); if (newTaskText.trim()) { onAddTask(newTaskText.trim(), newTaskPoints); setNewTaskText(''); setNewTaskPoints(1); }};
    return (
        <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="border-b border-slate-200 pb-4 mb-4"><h2 className="text-2xl font-bold text-slate-700">Bugünün Görevleri</h2><p className="text-slate-500 font-medium">{getFormattedDateTR()}</p></div>
            <div className="space-y-3">
                {(tasks || []).map(task => (<TaskItem key={task.id} task={task} isCompleted={(completions[today]?.[user.id] || []).includes(task.id)} onToggle={() => onToggleTask(task)} onDelete={() => onDeleteTask(task.id)} manageMode={manageMode} isAdmin={isAdmin} />))}
            </div>
            {manageMode && (
                 <form onSubmit={handleAddTask} className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-6">
                    <input type="text" value={newTaskText} onChange={e => setNewTaskText(e.target.value)} placeholder="Yeni görev..." className="md:col-span-2 p-3 border-2 border-slate-200 rounded-lg" />
                    <input type="number" min="1" value={newTaskPoints} onChange={e => setNewTaskPoints(Number(e.target.value))} placeholder="Puan" className="p-3 border-2 border-slate-200 rounded-lg" />
                    <button type="submit" className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600"><Plus /></button>
                </form>
            )}
        </div>
    );
};

const IconMap = { BookOpen, Smile, BrainCircuit, CheckCircle };

function TaskItem({ task, isCompleted, onToggle, onDelete, manageMode, isAdmin }) {
    const Icon = IconMap[task.icon] || CheckCircle;
    return (
        <div className={`p-4 rounded-xl flex items-center justify-between transition-all duration-300 ${isCompleted ? 'bg-green-100 text-slate-500' : 'bg-blue-50'}`}>
            <div className="flex items-center gap-4">
                 <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isCompleted ? 'bg-green-200' : 'bg-blue-200'}`}><Icon className={`w-7 h-7 ${isCompleted ? 'text-green-600' : 'text-blue-600'}`} /></div>
                 <div>
                    <span className={`font-semibold text-lg ${isCompleted ? 'line-through' : 'text-slate-800'}`}>{task.text}</span>
                    <span className="text-xs font-bold text-yellow-600 bg-yellow-200 px-2 py-0.5 rounded-full ml-2">{task.points || 1} Puan</span>
                 </div>
            </div>
            <div className="flex items-center gap-2">{manageMode ? <button onClick={onDelete} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 className="w-5 h-5" /></button> : <button onClick={onToggle} className={`w-16 h-16 rounded-full flex items-center justify-center transition-transform transform hover:scale-110 ${isCompleted ? 'bg-green-500' : 'bg-white shadow-md'}`} disabled={isAdmin}><CheckCircle className={`w-10 h-10 ${isCompleted ? 'text-white' : 'text-slate-300'}`} /></button>}</div>
        </div>
    );
};

function WeeklyRewardPanel({ user, tasks, completions, reward, onUpdateReward, manageMode }) {
    const [newRewardText, setNewRewardText] = useState(reward);
    useEffect(() => setNewRewardText(reward), [reward]);
    const weeklyProgress = useMemo(() => { if (user.isAdmin) return 7; let completedDays = 0; const today = new Date(); for (let i = 0; i < 7; i++) { const date = new Date(today); date.setDate(today.getDate() - i); const dateString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0]; if ((tasks || []).length > 0 && (completions[dateString]?.[user.id] || []).length === tasks.length) completedDays++; } return completedDays; }, [completions, user, tasks]);
    const allWeekCompleted = weeklyProgress >= 7;
    const handleUpdateReward = e => { e.preventDefault(); onUpdateReward(newRewardText); };
    return (
        <div className={`rounded-2xl shadow-lg p-6 text-center ${allWeekCompleted && !user.isAdmin ? 'bg-gradient-to-br from-yellow-300 to-orange-400 text-white' : 'bg-white'}`}>
            <Award className={`mx-auto h-16 w-16 mb-4 ${allWeekCompleted && !user.isAdmin ? 'text-white' : 'text-amber-500'}`} />
            <h3 className="text-xl font-bold">Haftalık Ödül</h3>
            {allWeekCompleted && !user.isAdmin ? <div className="mt-4"><p className="text-lg font-semibold">Tebrikler {user.name}!</p><p className="text-2xl font-bold mt-2 animate-pulse">{reward}</p></div> : <div className="mt-4"><p className="text-slate-600 text-lg font-semibold mb-2">{reward}</p><div className="w-full bg-slate-200 rounded-full h-4"><div className="bg-green-500 h-4 rounded-full" style={{ width: `${(weeklyProgress / 7) * 100}%` }}></div></div><p className="text-sm text-slate-500 mt-2">{user.isAdmin ? 'Yönetici Modu' : `${weeklyProgress} / 7 gün tamamlandı`}</p></div>}
            {manageMode && <form onSubmit={handleUpdateReward} className="mt-6"><h4 className="text-lg font-semibold text-slate-600 mb-2">Ödülü Değiştir</h4><input type="text" value={newRewardText} onChange={e => setNewRewardText(e.target.value)} className="w-full p-2 border-2 border-slate-200 rounded-lg" /><button type="submit" className="w-full mt-2 p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600">Kaydet</button></form>}
        </div>
    );
};

function ErrorScreen({ message }) { 
    return ( <div className="flex flex-col items-center justify-center h-screen bg-red-50 text-red-800 p-4"><AlertTriangle className="w-16 h-16 mb-4 text-red-500" /><h2 className="text-2xl font-bold mb-2">Bir Sorun Oluştu</h2><p className="text-center">{message}</p></div>)
};
