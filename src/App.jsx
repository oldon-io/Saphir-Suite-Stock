import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD0ouOpwwU6gk53TR3i4NdOYRinnkSmglg",
  authDomain: "saphir-suite-stock.firebaseapp.com",
  databaseURL: "https://saphir-suite-stock-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "saphir-suite-stock",
  storageBucket: "saphir-suite-stock.firebasestorage.app",
  messagingSenderId: "1016026524592",
  appId: "1:1016026524592:web:e0a7fc75542bcb9df08475"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const FLOORS = [
  { id: "ss", label: "Sous-sol" },
  { id: "r0", label: "Étage 0" },
  { id: "r3", label: "Étage 3" },
];

const CATS = ["Entretien", "Consommables", "Café & Thé", "Linge", "Alimentaire", "Autre"];
const USERS = ["Steve", "Marie-Ange", "Max", "Giulia"];

const DEFAULT_ARMOIRES = {
  ss: [{ id: "ss1", name: "Local technique" }],
  r0: [{ id: "r01", name: "Armoire logement 1" }, { id: "r02", name: "Armoire logement 2" }],
  r3: [{ id: "r31", name: "Armoire logement 5" }],
};

export default function App() {
  const [armoires, setArmoires] = useState(DEFAULT_ARMOIRES);
  const [products, setProducts] = useState({});
  const [log, setLog] = useState([]);
  const [floor, setFloor] = useState("r0");
  const [armoire, setArmoire] = useState("r01");
  const [view, setView] = useState("stock");
  const [user, setUser] = useState("Steve");
  const [newArmoire, setNewArmoire] = useState("");
  const [newProduct, setNewProduct] = useState({ name: "", unit: "pièce", qty: 1, min: 2, cat: "Consommables" });
  const [syncPulse, setSyncPulse] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const armoiresRef = ref(db, "armoires");
    const unsubArm = onValue(armoiresRef, (snap) => {
      if (snap.exists()) setArmoires(snap.val());
      setLoading(false);
    });

    const productsRef = ref(db, "products");
    const unsubProd = onValue(productsRef, (snap) => {
      if (snap.exists()) setProducts(snap.val());
    });

    const logRef = ref(db, "log");
    const unsubLog = onValue(logRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const arr = Object.values(data).sort((a, b) => b.ts - a.ts).slice(0, 50);
        setLog(arr);
      }
    });

    setSyncPulse(true);
    setTimeout(() => setSyncPulse(false), 1000);

    return () => { unsubArm(); unsubProd(); unsubLog(); };
  }, []);

  const pulse = () => { setSyncPulse(true); setTimeout(() => setSyncPulse(false), 800); };

  const addLog = async (action, name, delta) => {
    const ts = Date.now();
    const entry = {
      user, action, name, delta, ts,
      time: new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }),
      date: new Date().toLocaleDateString("fr-BE"),
    };
    await set(ref(db, `log/${ts}`), entry);
  };

  const changeQty = async (armId, prodId, delta) => {
    const p = products[armId]?.[prodId];
    if (!p) return;
    const newQty = Math.max(0, p.qty + delta);
    await update(ref(db, `products/${armId}/${prodId}`), { qty: newQty });
    await addLog(delta > 0 ? "ajout" : "retrait", p.name, delta);
    pulse();
  };

  const updateMin = async (armId, prodId, val) => {
    await update(ref(db, `products/${armId}/${prodId}`), { min: Math.max(0, parseInt(val) || 0) });
    pulse();
  };

  const delProduct = async (armId, prodId) => {
    const p = products[armId]?.[prodId];
    if (!p) return;
    const updated = { ...products[armId] };
    delete updated[prodId];
    await set(ref(db, `products/${armId}`), updated);
    await addLog("suppression", p.name, 0);
    pulse();
  };

  const addProduct = async (armId) => {
    if (!newProduct.name.trim()) return;
    const id = "p" + Date.now();
    const p = { id, name: newProduct.name.trim(), unit: newProduct.unit || "pièce", qty: parseInt(newProduct.qty) || 0, min: parseInt(newProduct.min) || 0, cat: newProduct.cat };
    await set(ref(db, `products/${armId}/${id}`), p);
    await addLog("ajout", p.name, p.qty);
    setNewProduct({ name: "", unit: "pièce", qty: 1, min: 2, cat: "Consommables" });
    pulse();
  };

  const addArmoire = async () => {
    const name = newArmoire.trim();
    if (!name) return;
    const id = floor + "_" + Date.now();
    const updated = [...(armoires[floor] || []), { id, name }];
    await set(ref(db, `armoires/${floor}`), updated);
    setArmoire(id);
    setNewArmoire("");
    pulse();
  };

  const delArmoire = async (floorId, idx) => {
    const arm = armoires[floorId][idx];
    const updated = armoires[floorId].filter((_, i) => i !== idx);
    await set(ref(db, `armoires/${floorId}`), updated);
    const updatedProds = { ...products };
    delete updatedProds[arm.id];
    await set(ref(db, "products"), updatedProds);
    if (armoire === arm.id) {
      setArmoire(updated.length ? updated[0].id : null);
    }
    pulse();
  };

  const getProds = (armId) => {
    const p = products[armId];
    if (!p) return [];
    return Object.values(p);
  };

  const lowStockAll = () => {
    let items = [];
    Object.keys(armoires).forEach(fid => {
      (armoires[fid] || []).forEach(arm => {
        const fl = FLOORS.find(f => f.id === fid);
        getProds(arm.id).forEach(p => {
          if (p.qty <= p.min) items.push({ ...p, armName: arm.name, floorName: fl?.label });
        });
      });
    });
    return items;
  };

  const armList = armoires[floor] || [];
  const selArm = armList.find(a => a.id === armoire);
  const prods = armoire ? getProds(armoire) : [];
  const lowAll = lowStockAll();

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Mono', monospace", color: "#555" }}>
      Connexion à Firebase...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#f0f0f0", fontFamily: "'DM Mono', 'Courier New', monospace", paddingBottom: "80px" }}>
      {/* Header */}
      <div style={{ background: "#111", borderBottom: "1px solid #222", padding: "16px 20px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#555", letterSpacing: "0.15em", textTransform: "uppercase" }}>Saphir Suite</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", letterSpacing: "-0.02em" }}>Stock 🏠</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: syncPulse ? "#4ade80" : "#2a2a2a", transition: "background 0.3s", boxShadow: syncPulse ? "0 0 8px #4ade80" : "none" }} />
            <select value={user} onChange={e => setUser(e.target.value)} style={{ background: "#1a1a1a", border: "1px solid #333", color: "#fff", padding: "6px 10px", borderRadius: "8px", fontSize: "13px", fontFamily: "inherit", cursor: "pointer" }}>
              {USERS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {lowAll.length > 0 && (
          <div style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "8px 12px", marginBottom: "12px", fontSize: "12px", color: "#fca5a5" }}>
            ⚠️ <strong>{lowAll.length} alerte{lowAll.length > 1 ? "s" : ""} :</strong> {lowAll.map(p => p.name).slice(0, 3).join(", ")}{lowAll.length > 3 ? "…" : ""}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: "6px" }}>
          {[["stock", "Stock"], ["config", "Armoires"], ["log", "Historique"]].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} style={{ padding: "5px 14px", borderRadius: "20px", border: "1px solid", borderColor: view === id ? "#fff" : "#333", background: view === id ? "#fff" : "transparent", color: view === id ? "#000" : "#777", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 20px" }}>
        {/* Floor nav */}
        {(view === "stock" || view === "config") && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
            {FLOORS.map(f => {
              const hasAlert = (armoires[f.id] || []).some(a => getProds(a.id).some(p => p.qty <= p.min));
              return (
                <button key={f.id} onClick={() => { setFloor(f.id); const arms = armoires[f.id] || []; if (arms.length) setArmoire(arms[0].id); }} style={{ padding: "6px 14px", borderRadius: "20px", border: "1px solid", borderColor: floor === f.id ? "#fff" : "#333", background: floor === f.id ? "#fff" : "transparent", color: floor === f.id ? "#000" : "#777", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                  {f.label}{hasAlert ? " ⚠️" : ""}
                </button>
              );
            })}
          </div>
        )}

        {/* STOCK VIEW */}
        {view === "stock" && (
          <>
            {/* Armoire selector */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", marginBottom: "16px" }}>
              {armList.map(a => {
                const ap = getProds(a.id);
                const hasLow = ap.some(p => p.qty <= p.min);
                return (
                  <button key={a.id} onClick={() => setArmoire(a.id)} style={{ padding: "10px 12px", borderRadius: "10px", border: a.id === armoire ? "2px solid #fff" : "1px solid #222", background: "#111", color: "#f0f0f0", fontSize: "13px", cursor: "pointer", textAlign: "left", position: "relative" }}>
                    {hasLow && <span style={{ position: "absolute", top: "8px", right: "8px", width: "7px", height: "7px", borderRadius: "50%", background: "#ef4444" }} />}
                    <div style={{ fontWeight: "600" }}>{a.name}</div>
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>{ap.length} produit{ap.length > 1 ? "s" : ""}</div>
                  </button>
                );
              })}
              {!armList.length && <div style={{ color: "#555", fontSize: "13px" }}>Aucune armoire — crée-en une dans "Armoires"</div>}
            </div>

            {/* Products */}
            {selArm && (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "16px" }}>
                <div style={{ fontSize: "11px", color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>{selArm.name}</div>

                {!prods.length && <div style={{ color: "#555", fontSize: "13px", marginBottom: "12px" }}>Aucun produit.</div>}

                {prods.map(p => {
                  const isLow = p.qty <= p.min;
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid #1a1a1a" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "14px", fontWeight: "600", color: "#f0f0f0" }}>{p.name}</div>
                        <div style={{ fontSize: "11px", color: "#444", marginTop: "2px" }}>
                          {p.cat} · min{" "}
                          <input type="number" defaultValue={p.min} onBlur={e => updateMin(armoire, p.id, e.target.value)} style={{ width: "40px", background: "transparent", border: "none", borderBottom: "1px dotted #444", color: "#555", fontSize: "11px", fontFamily: "inherit", textAlign: "center" }} />
                          {" "}{p.unit}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button onClick={() => changeQty(armoire, p.id, -1)} style={qBtn("#f87171")}>−</button>
                        <span style={{ minWidth: "48px", textAlign: "center", fontSize: "17px", fontWeight: "700", color: isLow ? "#f87171" : "#f0f0f0" }}>
                          {p.qty}<span style={{ fontSize: "10px", fontWeight: "400", color: "#555", marginLeft: "2px" }}>{p.unit}</span>
                        </span>
                        <button onClick={() => changeQty(armoire, p.id, 1)} style={qBtn("#4ade80")}>+</button>
                      </div>
                      <button onClick={() => delProduct(armoire, p.id)} style={{ background: "transparent", border: "none", color: "#444", cursor: "pointer", fontSize: "16px" }}>🗑</button>
                    </div>
                  );
                })}

                {/* Add product form */}
                <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #1a1a1a" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "6px" }}>
                    <input placeholder="Nom du produit" value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))} style={inp} />
                    <input placeholder="Unité" value={newProduct.unit} onChange={e => setNewProduct(p => ({ ...p, unit: e.target.value }))} style={inp} />
                    <select value={newProduct.cat} onChange={e => setNewProduct(p => ({ ...p, cat: e.target.value }))} style={inp}>
                      {CATS.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input type="number" placeholder="Qté" value={newProduct.qty} onChange={e => setNewProduct(p => ({ ...p, qty: e.target.value }))} style={{ ...inp, flex: 1 }} />
                      <input type="number" placeholder="Min" value={newProduct.min} onChange={e => setNewProduct(p => ({ ...p, min: e.target.value }))} style={{ ...inp, flex: 1 }} />
                    </div>
                  </div>
                  <button onClick={() => addProduct(armoire)} style={{ width: "100%", padding: "9px", borderRadius: "8px", background: "#1a1a1a", border: "1px solid #333", color: "#fff", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>+ Ajouter produit</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* CONFIG VIEW */}
        {view === "config" && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "16px" }}>
            <div style={{ fontSize: "11px", color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>
              Armoires — {FLOORS.find(f => f.id === floor)?.label}
            </div>
            {armList.map((a, i) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}>
                <span style={{ flex: 1, fontSize: "14px" }}>{a.name}</span>
                <span style={{ fontSize: "11px", color: "#555" }}>{getProds(a.id).length} produits</span>
                <button onClick={() => delArmoire(floor, i)} style={{ background: "transparent", border: "none", color: "#444", cursor: "pointer", fontSize: "16px" }}>🗑</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <input placeholder="Nom de l'armoire ou local…" value={newArmoire} onChange={e => setNewArmoire(e.target.value)} onKeyDown={e => e.key === "Enter" && addArmoire()} style={{ ...inp, flex: 1 }} />
              <button onClick={addArmoire} style={{ padding: "8px 14px", borderRadius: "8px", background: "#1a1a1a", border: "1px solid #333", color: "#fff", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>+ Ajouter</button>
            </div>
          </div>
        )}

        {/* LOG VIEW */}
        {view === "log" && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "16px" }}>
            <div style={{ fontSize: "11px", color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>Historique</div>
            {!log.length && <div style={{ color: "#555", fontSize: "13px" }}>Aucune action.</div>}
            {log.map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #1a1a1a", fontSize: "12px" }}>
                <div>
                  <span style={{ color: e.delta > 0 ? "#4ade80" : e.delta < 0 ? "#f87171" : "#60a5fa" }}>
                    {e.delta > 0 ? "+" : e.delta < 0 ? "−" : "●"} {e.name}
                  </span>
                  {e.delta !== 0 && <span style={{ color: "#555" }}> ({Math.abs(e.delta)})</span>}
                </div>
                <div style={{ textAlign: "right", color: "#555" }}>
                  <div>{e.user}</div>
                  <div>{e.time}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#111", borderTop: "1px solid #1e1e1e", padding: "12px 20px", display: "flex", justifyContent: "space-around" }}>
        {[
          { label: "Produits", val: Object.values(products).reduce((acc, p) => acc + Object.keys(p).length, 0) },
          { label: "⚠️ Alertes", val: lowAll.length, color: lowAll.length > 0 ? "#f87171" : "#555" },
          { label: "Actions", val: log.length },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "18px", fontWeight: "700", color: s.color || "#f0f0f0" }}>{s.val}</div>
            <div style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inp = {
  background: "#0d0d0d", border: "1px solid #333", color: "#fff",
  padding: "8px 10px", borderRadius: "8px", fontSize: "13px",
  fontFamily: "'DM Mono', monospace", width: "100%", boxSizing: "border-box",
};

const qBtn = (color) => ({
  width: "32px", height: "32px", borderRadius: "8px",
  background: "#1a1a1a", border: `1px solid ${color}44`,
  color, fontSize: "18px", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "inherit",
});
