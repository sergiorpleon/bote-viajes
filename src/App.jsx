import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, Users, Wallet, ArrowLeftRight, Settings, ChevronLeft, Trash2,
  Camera, X, Check, TrendingUp, TrendingDown, Landmark, Luggage,
  Receipt, HandCoins, ListOrdered, AlertTriangle, Loader2, RefreshCw,
} from "lucide-react";
import { storeGet, storeSet, storeDelete, isShared } from "./storage.js";

/* ---------------------------------------------------------------
   TOKENS — "cuaderno de viaje" (travel ledger / passport)
   paper #EFE6D8 · paperLight #F7F2E7 · ink #24344D · teal #1F5C55
   brick #B23A2E · gold #C68A2E · line #D8C9AE
----------------------------------------------------------------*/
const C = {
  paper: "#EFE6D8",
  paperLight: "#F7F2E7",
  ink: "#24344D",
  inkSoft: "#5A6B85",
  teal: "#1F5C55",
  tealDark: "#123A35",
  brick: "#B23A2E",
  gold: "#C68A2E",
  line: "#D8C9AE",
  lineSoft: "#E4D9C3",
  white: "#FFFDF8",
};

const TRIP_COLORS = ["#1F5C55", "#B23A2E", "#C68A2E", "#24344D", "#5C6B2E", "#6B3F5C"];
const TRIP_EMOJI = ["🧳", "⛰️", "🏖️", "🚐", "🗺️", "✈️", "⛺", "🏔️", "🚲", "🛶"];

function useFonts() {
  useEffect(() => {
    const id = "bote-viajes-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap";
    document.head.appendChild(link);
  }, []);
}

const fontDisplay = { fontFamily: "'Fraunces', serif" };
const fontBody = { fontFamily: "'Inter', sans-serif" };
const fontMono = { fontFamily: "'IBM Plex Mono', monospace" };

function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  } catch (e) {
    return iso;
  }
}

function money(amount, symbol) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}${symbol ? symbol + " " : ""}${Math.abs(n).toFixed(2)}`;
}

/* ---------------------------------------------------------------
   IMAGE RESIZE (photo upload -> small dataURL)
----------------------------------------------------------------*/
function resizeImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagen no válida"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------
   BALANCE MATH
   - "bote" cash = contributions - bote-expenses (real money in the pot)
   - member ledger = contributions + direct payments - fair share of
     (bote-expenses + direct payments), split equally across members
----------------------------------------------------------------*/
function toBase(amount, code, trip) {
  if (!trip) return amount;
  if (code === trip.currencies.A.code) return amount;
  return amount / (trip.rate || 1);
}

function computeTripStats(trip, movements) {
  const members = trip.members || [];
  const ledger = {};
  members.forEach((m) => (ledger[m.id] = 0));
  let boteCash = 0;
  let totalExpenses = 0;
  let totalContributed = 0;

  movements.forEach((mv) => {
    const base = toBase(mv.amount, mv.currencyCode, trip);
    if (mv.type === "contribution") {
      // "Aporte en efectivo": real cash goes into the pot.
      // "Aporte por pago propio" (virtual): the member already paid for
      // something out of pocket and this is just the compensating credit —
      // no real cash enters the pot, but it did cost the group money.
      totalContributed += base;
      if (ledger[mv.memberId] !== undefined) ledger[mv.memberId] += base;
      if (!mv.virtual) {
        boteCash += base;
      } else {
        totalExpenses += base;
      }
    } else if (mv.type === "expense") {
      // Whether it paid a vendor directly or reimbursed a member in cash,
      // real money leaves the pot and it counts as group spend either way.
      boteCash -= base;
      totalExpenses += base;
    }
  });

  const n = members.length || 1;
  const share = totalExpenses / n;
  const balances = members.map((m) => ({
    member: m,
    ledger: ledger[m.id] || 0,
    share,
    balance: (ledger[m.id] || 0) - share,
  }));

  return { boteCash, totalExpenses, totalContributed, share, balances };
}

/* ---------------------------------------------------------------
   SMALL UI ATOMS
----------------------------------------------------------------*/
function Btn({ children, onClick, variant = "primary", type = "button", disabled, style, full }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "11px 18px",
    borderRadius: 999,
    fontWeight: 600,
    fontSize: 14.5,
    cursor: disabled ? "default" : "pointer",
    border: "1.5px solid transparent",
    transition: "transform .1s ease, opacity .15s ease",
    opacity: disabled ? 0.5 : 1,
    width: full ? "100%" : undefined,
    ...fontBody,
  };
  const variants = {
    primary: { background: C.teal, color: C.white },
    brick: { background: C.brick, color: C.white },
    ghost: { background: "transparent", color: C.ink, border: `1.5px solid ${C.line}` },
    subtle: { background: C.paperLight, color: C.ink, border: `1.5px solid ${C.line}` },
    text: { background: "transparent", color: C.inkSoft, padding: "8px 6px" },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, marginBottom: 6, letterSpacing: 0.2, ...fontBody }}>
        {label}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 4, ...fontBody }}>{hint}</div>}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1.5px solid ${C.line}`,
  background: C.white,
  color: C.ink,
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
  ...fontBody,
};

function Input(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function Select(props) {
  return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

/* Ink-stamp badge: signature element, used for balances & bote total */
function Stamp({ tone = "teal", size = 96, children, rotate = -6 }) {
  const toneColor = tone === "brick" ? C.brick : tone === "gold" ? C.gold : C.teal;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2.5px solid ${toneColor}`,
        boxShadow: `0 0 0 3px ${C.paperLight}, 0 0 0 4.5px ${toneColor}55`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: toneColor,
        transform: `rotate(${rotate}deg)`,
        flexShrink: 0,
        background: "transparent",
      }}
    >
      {children}
    </div>
  );
}

function Sheet({ title, onClose, children, wide }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(36,52,77,0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 50,
        padding: 0,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.paperLight,
          width: "100%",
          maxWidth: wide ? 640 : 480,
          maxHeight: "88vh",
          overflowY: "auto",
          borderRadius: "20px 20px 0 0",
          padding: "18px 20px 28px",
          boxShadow: "0 -8px 30px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ width: 40, height: 5, borderRadius: 4, background: C.line, position: "absolute", left: "50%", top: 8, transform: "translateX(-50%)" }} />
          <h2 style={{ ...fontDisplay, fontWeight: 600, fontSize: 21, color: C.ink, margin: 0, marginTop: 8 }}>{title}</h2>
          <button onClick={onClose} style={{ background: C.paper, border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.ink }}>
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 999,
        border: `1.5px solid ${active ? C.teal : C.line}`,
        background: active ? C.teal : "transparent",
        color: active ? C.white : C.inkSoft,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        ...fontBody,
      }}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------
   HOME — trip list
----------------------------------------------------------------*/
function Home({ trips, onOpen, onNew, onConverter, onWipe, onRefresh, refreshing }) {
  return (
    <div style={{ padding: "26px 18px 100px", maxWidth: 720, margin: "0 auto" }}>
      <header style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12.5, letterSpacing: 2, fontWeight: 600, color: C.teal, textTransform: "uppercase", ...fontBody }}>
            Cuaderno de viaje
          </div>
          <button
            onClick={onRefresh}
            style={{ background: "none", border: "none", color: C.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, ...fontBody }}
          >
            <RefreshCw size={13} style={refreshing ? { animation: "spin 0.8s linear infinite" } : undefined} /> Actualizar
          </button>
        </div>
        <h1 style={{ ...fontDisplay, fontSize: 34, fontWeight: 600, color: C.ink, margin: "4px 0 2px" }}>El Bote</h1>
        <p style={{ ...fontBody, color: C.inkSoft, fontSize: 14.5, margin: 0 }}>
          El fondo común de cada viaje, quién ha puesto qué y quién debe a quién.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, background: `${C.gold}1f`, border: `1px solid ${C.gold}66`, borderRadius: 10, padding: "8px 11px" }}>
          <Users size={13} color={C.gold} style={{ flexShrink: 0 }} />
          <span style={{ ...fontBody, fontSize: 11.5, color: C.ink }}>
            {isShared
              ? "Datos compartidos: cualquiera con este enlace puede ver y editar los viajes."
              : "Datos guardados solo en este navegador: no se comparten con el resto del grupo."}
          </span>
        </div>
      </header>

      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <Btn variant="primary" onClick={onNew} style={{ flex: 1 }}>
          <Plus size={17} /> Nuevo viaje
        </Btn>
        <Btn variant="subtle" onClick={onConverter}>
          <ArrowLeftRight size={16} /> Conversor
        </Btn>
      </div>

      {trips.length === 0 ? (
        <div
          style={{
            border: `1.5px dashed ${C.line}`,
            borderRadius: 18,
            padding: "40px 20px",
            textAlign: "center",
            color: C.inkSoft,
          }}
        >
          <Luggage size={30} style={{ marginBottom: 10, color: C.teal }} />
          <div style={{ ...fontDisplay, fontSize: 19, color: C.ink, marginBottom: 4 }}>Todavía no hay viajes</div>
          <div style={{ ...fontBody, fontSize: 13.5 }}>Crea el primero y empieza a llevar el bote al día.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {trips.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpen(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                textAlign: "left",
                background: C.white,
                border: `1.5px solid ${C.line}`,
                borderRadius: 16,
                padding: 12,
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: t.photo ? `url(${t.photo}) center/cover` : t.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                }}
              >
                {!t.photo && t.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...fontDisplay, fontSize: 18, fontWeight: 600, color: C.ink }}>{t.name}</div>
                <div style={{ ...fontBody, fontSize: 12.5, color: C.inkSoft }}>
                  {/* full trip objects, not index entries: read members/currencies */}
                  {t.members.length} {t.members.length === 1 ? "familia" : "familias"} ·{" "}
                  {t.currencies.A.code} / {t.currencies.B.code}
                </div>
              </div>
              <div style={{ color: C.line, fontSize: 22, transform: "rotate(180deg)" }}>‹</div>
            </button>
          ))}
        </div>
      )}

      {trips.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 30 }}>
          <button
            onClick={onWipe}
            style={{ background: "none", border: "none", color: C.inkSoft, fontSize: 12, cursor: "pointer", textDecoration: "underline", ...fontBody }}
          >
            Borrar todos los datos guardados
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   NEW / EDIT TRIP
----------------------------------------------------------------*/
function TripForm({ initial, onCancel, onSave, onDelete }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [color, setColor] = useState(initial?.color || TRIP_COLORS[0]);
  const [emoji, setEmoji] = useState(initial?.emoji || TRIP_EMOJI[0]);
  const [photo, setPhoto] = useState(initial?.photo || null);
  const [members, setMembers] = useState(initial?.members || [{ id: uid("m"), name: "" }, { id: uid("m"), name: "" }, { id: uid("m"), name: "" }]);
  const [ca, setCa] = useState(initial?.currencies?.A || { code: "EUR", symbol: "€", name: "Euro" });
  const [cb, setCb] = useState(initial?.currencies?.B || { code: "USD", symbol: "$", name: "Dólar" });
  const [rate, setRate] = useState(initial?.rate ?? 1.08);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const addMember = () => setMembers((m) => [...m, { id: uid("m"), name: "" }]);
  const removeMember = (id) => setMembers((m) => m.filter((x) => x.id !== id));
  const updateMember = (id, val) => setMembers((m) => m.map((x) => (x.id === id ? { ...x, name: val } : x)));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await resizeImage(file, 400);
      setPhoto(dataUrl);
    } catch (err) {
      setError("No se pudo cargar la foto.");
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    setError("");
    const cleanMembers = members.map((m) => ({ ...m, name: m.name.trim() })).filter((m) => m.name);
    if (!name.trim()) return setError("Ponle un nombre al viaje.");
    if (cleanMembers.length < 1) return setError("Añade al menos un miembro o familia.");
    if (!ca.code.trim() || !cb.code.trim()) return setError("Completa las dos monedas.");
    if (ca.code.trim().toUpperCase() === cb.code.trim().toUpperCase()) return setError("Las dos monedas deben ser distintas.");
    if (!rate || Number(rate) <= 0) return setError("La tasa de cambio debe ser un número mayor que 0.");

    onSave({
      id: initial?.id || uid("trip"),
      name: name.trim(),
      color,
      emoji,
      photo,
      members: cleanMembers,
      currencies: {
        A: { code: ca.code.trim().toUpperCase(), symbol: ca.symbol.trim() || ca.code.trim(), name: ca.name.trim() || ca.code.trim() },
        B: { code: cb.code.trim().toUpperCase(), symbol: cb.symbol.trim() || cb.code.trim(), name: cb.name.trim() || cb.code.trim() },
      },
      rate: Number(rate),
      createdAt: initial?.createdAt || Date.now(),
    });
  };

  return (
    <Sheet title={isEdit ? "Editar viaje" : "Nuevo viaje"} onClose={onCancel} wide>
      <Field label="Nombre del viaje">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Portugal en furgo" />
      </Field>

      <Field label="Foto o icono">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 60, height: 60, borderRadius: 12, flexShrink: 0,
              background: photo ? `url(${photo}) center/cover` : color,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
            }}
          >
            {!photo && emoji}
            {uploading && <Loader2 size={18} className="animate-spin" color="#fff" />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Btn variant="subtle" onClick={() => fileRef.current?.click()} style={{ padding: "7px 12px", fontSize: 13 }}>
              <Camera size={14} /> {photo ? "Cambiar foto" : "Subir foto"}
            </Btn>
            {photo && (
              <button onClick={() => setPhoto(null)} style={{ background: "none", border: "none", color: C.inkSoft, fontSize: 12, cursor: "pointer", textAlign: "left", ...fontBody }}>
                Quitar foto, usar icono
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
        </div>
        {!photo && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {TRIP_EMOJI.map((em) => (
              <button
                key={em}
                onClick={() => setEmoji(em)}
                style={{
                  width: 34, height: 34, borderRadius: 9, fontSize: 17, cursor: "pointer",
                  border: emoji === em ? `2px solid ${C.teal}` : `1.5px solid ${C.line}`,
                  background: C.white,
                }}
              >
                {em}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {TRIP_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
                border: color === c ? `2.5px solid ${C.ink}` : "2.5px solid transparent",
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="Familias / miembros" hint="Cada uno cuenta como una parte igual del bote.">
        <div style={{ display: "grid", gap: 8 }}>
          {members.map((m, i) => (
            <div key={m.id} style={{ display: "flex", gap: 8 }}>
              <Input value={m.name} onChange={(e) => updateMember(m.id, e.target.value)} placeholder={`Familia ${i + 1}`} />
              {members.length > 1 && (
                <button onClick={() => removeMember(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.brick, padding: "0 6px" }}>
                  <Trash2 size={17} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button onClick={addMember} style={{ marginTop: 8, background: "none", border: "none", color: C.teal, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, ...fontBody }}>
          <Plus size={14} /> Añadir familia
        </button>
      </Field>

      <Field label="Monedas y tasa de cambio">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
          <div style={{ border: `1.5px solid ${C.line}`, borderRadius: 12, padding: 10, background: C.white }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 6 }}>MONEDA A</div>
            <Input value={ca.code} onChange={(e) => setCa({ ...ca, code: e.target.value })} placeholder="EUR" style={{ marginBottom: 6, fontSize: 13, padding: "7px 9px" }} />
            <Input value={ca.symbol} onChange={(e) => setCa({ ...ca, symbol: e.target.value })} placeholder="€" style={{ marginBottom: 6, fontSize: 13, padding: "7px 9px" }} />
            <Input value={ca.name} onChange={(e) => setCa({ ...ca, name: e.target.value })} placeholder="Euro" style={{ fontSize: 13, padding: "7px 9px" }} />
          </div>
          <div style={{ border: `1.5px solid ${C.line}`, borderRadius: 12, padding: 10, background: C.white }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.brick, marginBottom: 6 }}>MONEDA B</div>
            <Input value={cb.code} onChange={(e) => setCb({ ...cb, code: e.target.value })} placeholder="USD" style={{ marginBottom: 6, fontSize: 13, padding: "7px 9px" }} />
            <Input value={cb.symbol} onChange={(e) => setCb({ ...cb, symbol: e.target.value })} placeholder="$" style={{ marginBottom: 6, fontSize: 13, padding: "7px 9px" }} />
            <Input value={cb.name} onChange={(e) => setCb({ ...cb, name: e.target.value })} placeholder="Dólar" style={{ fontSize: 13, padding: "7px 9px" }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: C.ink, ...fontBody }}>
          <span>1 {ca.code || "A"} =</span>
          <Input type="number" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 100 }} />
          <span>{cb.code || "B"}</span>
        </div>
      </Field>

      {error && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: C.brick, fontSize: 13, marginBottom: 12, ...fontBody }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <Btn variant="primary" onClick={submit} full>
          <Check size={16} /> {isEdit ? "Guardar cambios" : "Crear viaje"}
        </Btn>
      </div>
      {isEdit && (
        <button
          onClick={onDelete}
          style={{ marginTop: 14, width: "100%", background: "none", border: "none", color: C.brick, fontSize: 13, cursor: "pointer", ...fontBody }}
        >
          Eliminar este viaje
        </button>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   ADD MOVEMENT FLOW (contribution / expense / direct payment)
----------------------------------------------------------------*/
function AddMovementSheet({ trip, onClose, onSave }) {
  const [type, setType] = useState(null);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(trip.currencies.A.code);
  const [memberId, setMemberId] = useState(trip.members[0]?.id || "");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [contribKind, setContribKind] = useState("cash"); // cash | virtual
  const [expenseKind, setExpenseKind] = useState("pot"); // pot | reimbursement
  const [reimburseMemberId, setReimburseMemberId] = useState(trip.members[0]?.id || "");
  const [error, setError] = useState("");

  const typeMeta = {
    contribution: { title: "Aporte al bote", tone: "teal", icon: <HandCoins size={16} /> },
    expense: { title: "Gasto del bote", tone: "brick", icon: <Receipt size={16} /> },
  };

  const submit = () => {
    setError("");
    const n = Number(amount);
    if (!amount || isNaN(n) || n <= 0) return setError("Introduce un importe válido.");
    if (type === "contribution" && !memberId) return setError("Selecciona quién aporta.");
    if (type === "expense" && expenseKind === "reimbursement" && !reimburseMemberId) return setError("Selecciona a quién se reembolsa.");

    if (type === "contribution") {
      onSave({
        id: uid("mv"),
        type: "contribution",
        amount: n,
        currencyCode,
        memberId,
        virtual: contribKind === "virtual",
        description: description.trim(),
        date,
        createdAt: Date.now(),
      });
    } else {
      onSave({
        id: uid("mv"),
        type: "expense",
        amount: n,
        currencyCode,
        memberId: expenseKind === "reimbursement" ? reimburseMemberId : null,
        reimbursement: expenseKind === "reimbursement",
        description: description.trim(),
        date,
        createdAt: Date.now(),
      });
    }
  };

  if (!type) {
    return (
      <Sheet title="Nuevo movimiento" onClose={onClose}>
        <p style={{ ...fontBody, color: C.inkSoft, fontSize: 13.5, marginTop: -4, marginBottom: 16 }}>
          ¿Qué ha pasado?
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {[
            { key: "contribution", desc: "Alguien mete dinero en el bote, o compensa algo que pagó de su bolsillo." },
            { key: "expense", desc: "Se paga algo con el dinero del bote, o se reembolsa a quien lo adelantó." },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setType(opt.key)}
              style={{
                display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                background: C.white, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", cursor: "pointer",
              }}
            >
              <Stamp tone={typeMeta[opt.key].tone} size={40} rotate={0}>{typeMeta[opt.key].icon}</Stamp>
              <div>
                <div style={{ ...fontDisplay, fontWeight: 600, fontSize: 16, color: C.ink }}>{typeMeta[opt.key].title}</div>
                <div style={{ ...fontBody, fontSize: 12.5, color: C.inkSoft }}>{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={typeMeta[type].title} onClose={onClose}>
      {type === "contribution" && (
        <Field label="¿Cómo se aporta?" hint={contribKind === "virtual" ? "El miembro ya pagó algo de su bolsillo por el grupo. Se le anota como aportación, sin que entre dinero físico en el bote, y cuenta como gasto del viaje." : "Dinero real que entra en el fondo común."}>
          <div style={{ display: "flex", gap: 8 }}>
            <Chip active={contribKind === "cash"} onClick={() => setContribKind("cash")}>Dinero al bote</Chip>
            <Chip active={contribKind === "virtual"} onClick={() => setContribKind("virtual")}>Compensa un pago propio</Chip>
          </div>
        </Field>
      )}

      {type === "expense" && (
        <Field label="¿Quién cobra este gasto?" hint={expenseKind === "reimbursement" ? "El bote le devuelve en efectivo lo que ya pagó de su bolsillo. Sale dinero real del bote." : "Se paga directamente con el dinero del bote."}>
          <div style={{ display: "flex", gap: 8 }}>
            <Chip active={expenseKind === "pot"} onClick={() => setExpenseKind("pot")}>Pagado desde el bote</Chip>
            <Chip active={expenseKind === "reimbursement"} onClick={() => setExpenseKind("reimbursement")}>Reembolso a un miembro</Chip>
          </div>
        </Field>
      )}

      {type === "expense" && expenseKind === "reimbursement" && (
        <Field label="¿A quién se reembolsa?">
          <Select value={reimburseMemberId} onChange={(e) => setReimburseMemberId(e.target.value)}>
            {trip.members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label={type === "expense" ? "¿En qué se ha gastado?" : "Concepto (opcional)"}>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === "expense" ? "Ej. Alojamiento noche 3" : "Ej. Gasolina, cena…"} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Importe">
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Moneda">
          <Select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
            <option value={trip.currencies.A.code}>{trip.currencies.A.code} ({trip.currencies.A.symbol})</option>
            <option value={trip.currencies.B.code}>{trip.currencies.B.code} ({trip.currencies.B.symbol})</option>
          </Select>
        </Field>
      </div>

      {type === "contribution" && (
        <Field label="¿Quién aporta?">
          <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {trip.members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Fecha">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {error && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: C.brick, fontSize: 13, marginBottom: 12, ...fontBody }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <Btn variant="ghost" onClick={() => setType(null)}>Atrás</Btn>
        <Btn variant="primary" onClick={submit} full>
          <Check size={16} /> Guardar movimiento
        </Btn>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   CONVERTER (works standalone, or pinned to a trip's currencies)
----------------------------------------------------------------*/
function Converter({ trip, onClose, standalone }) {
  const [ca, setCa] = useState(trip ? trip.currencies.A : { code: "EUR", symbol: "€" });
  const [cb, setCb] = useState(trip ? trip.currencies.B : { code: "USD", symbol: "$" });
  const [rate, setRate] = useState(trip ? trip.rate : 1.08);
  const [amountA, setAmountA] = useState("100");
  const [dir, setDir] = useState("A_TO_B");

  const amountB = useMemo(() => {
    const n = Number(amountA);
    if (isNaN(n)) return "";
    return dir === "A_TO_B" ? (n * rate).toFixed(2) : (n / rate).toFixed(2);
  }, [amountA, rate, dir]);

  const body = (
    <>
      {!trip && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Field label="Moneda origen">
            <div style={{ display: "flex", gap: 6 }}>
              <Input value={ca.code} onChange={(e) => setCa({ ...ca, code: e.target.value.toUpperCase() })} style={{ width: "60%" }} />
              <Input value={ca.symbol} onChange={(e) => setCa({ ...ca, symbol: e.target.value })} style={{ width: "40%" }} />
            </div>
          </Field>
          <Field label="Moneda destino">
            <div style={{ display: "flex", gap: 6 }}>
              <Input value={cb.code} onChange={(e) => setCb({ ...cb, code: e.target.value.toUpperCase() })} style={{ width: "60%" }} />
              <Input value={cb.symbol} onChange={(e) => setCb({ ...cb, symbol: e.target.value })} style={{ width: "40%" }} />
            </div>
          </Field>
        </div>
      )}

      {!trip && (
        <Field label={`Tasa: 1 ${ca.code} =`}>
          <Input type="number" step="0.0001" value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} />
        </Field>
      )}
      {trip && (
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 14, ...fontBody }}>
          Tasa del viaje: 1 {ca.code} = {rate} {cb.code}
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        <Field label={dir === "A_TO_B" ? `Importe en ${ca.code}` : `Importe en ${cb.code}`}>
          <Input type="number" step="0.01" value={amountA} onChange={(e) => setAmountA(e.target.value)} style={{ fontSize: 22, padding: "14px 14px", ...fontMono }} />
        </Field>

        <div style={{ display: "flex", justifyContent: "center", margin: "2px 0" }}>
          <button
            onClick={() => { setDir(dir === "A_TO_B" ? "B_TO_A" : "A_TO_B"); setAmountA(amountB || "0"); }}
            style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: "50%", width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.teal }}
          >
            <ArrowLeftRight size={17} />
          </button>
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, marginBottom: 6, ...fontBody }}>
            Equivale a
          </div>
          <div style={{ padding: "14px 14px", borderRadius: 10, background: C.tealDark, color: C.white, fontSize: 22, ...fontMono }}>
            {dir === "A_TO_B" ? cb.symbol : ca.symbol} {amountB || "0.00"}
          </div>
        </div>
      </div>
    </>
  );

  if (standalone) {
    return (
      <Sheet title="Conversor de moneda" onClose={onClose}>
        {body}
      </Sheet>
    );
  }
  return <div>{body}</div>;
}

/* ---------------------------------------------------------------
   TRIP DETAIL
----------------------------------------------------------------*/
function TripDetail({ trip, movements, onBack, onEdit, onAddMovement, onDeleteMovement, onRefresh, refreshing }) {
  const [tab, setTab] = useState("resumen");
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const stats = useMemo(() => computeTripStats(trip, movements), [trip, movements]);
  const memberName = (id) => trip.members.find((m) => m.id === id)?.name || "Miembro eliminado";
  const symbolFor = (code) => (code === trip.currencies.A.code ? trip.currencies.A.symbol : trip.currencies.B.symbol);

  const sorted = useMemo(
    () => [...movements].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)),
    [movements]
  );
  const filtered = filter === "all" ? sorted : sorted.filter((m) => m.type === filter);

  const typeLabel = { contribution: "Aporte", expense: "Gasto" };
  const typeTone = { contribution: C.teal, expense: C.brick };

  const TABS = [
    { key: "resumen", label: "Resumen", icon: <Wallet size={15} /> },
    { key: "movimientos", label: "Movimientos", icon: <ListOrdered size={15} /> },
    { key: "conversor", label: "Conversor", icon: <ArrowLeftRight size={15} /> },
    { key: "ajustes", label: "Ajustes", icon: <Settings size={15} /> },
  ];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", paddingBottom: 100 }}>
      {/* Header */}
      <div
        style={{
          background: trip.photo ? `linear-gradient(180deg, rgba(18,58,53,0.15), rgba(18,58,53,0.75)), url(${trip.photo}) center/cover` : `linear-gradient(160deg, ${trip.color}, ${C.tealDark})`,
          padding: "18px 18px 26px",
          color: C.white,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.18)", border: "none", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.white }}>
            <ChevronLeft size={19} />
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onRefresh} style={{ background: "rgba(255,255,255,0.18)", border: "none", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.white }}>
              <RefreshCw size={15} style={refreshing ? { animation: "spin 0.8s linear infinite" } : undefined} />
            </button>
            <button onClick={onEdit} style={{ background: "rgba(255,255,255,0.18)", border: "none", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.white }}>
              <Settings size={16} />
            </button>
          </div>
        </div>
        <div style={{ fontSize: 11.5, letterSpacing: 2, textTransform: "uppercase", opacity: 0.85, ...fontBody }}>
          {trip.members.length} {trip.members.length === 1 ? "familia" : "familias"} · {trip.currencies.A.code} / {trip.currencies.B.code}
        </div>
        <h1 style={{ ...fontDisplay, fontSize: 30, fontWeight: 600, margin: "2px 0 18px" }}>{trip.name}</h1>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Stamp tone={stats.boteCash >= 0 ? "teal" : "brick"} size={78} rotate={-8}>
            <div style={{ textAlign: "center", lineHeight: 1.1 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1 }}>BOTE</div>
              <div style={{ ...fontMono, fontSize: 13.5, fontWeight: 600 }}>{money(stats.boteCash, trip.currencies.A.symbol)}</div>
            </div>
          </Stamp>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, ...fontBody }}>Dinero disponible en el fondo</div>
            <div style={{ fontSize: 12, opacity: 0.7, ...fontBody, marginTop: 2 }}>
              Gasto total del grupo: {money(stats.totalExpenses, trip.currencies.A.symbol)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, padding: "14px 14px 4px", overflowX: "auto", background: C.paperLight, borderBottom: `1.5px dashed ${C.line}` }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: "10px 10px 0 0",
              border: "none", borderBottom: tab === t.key ? `2.5px solid ${C.teal}` : "2.5px solid transparent",
              background: "transparent", color: tab === t.key ? C.teal : C.inkSoft, fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", ...fontBody,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "18px 18px 0" }}>
        {tab === "resumen" && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10, ...fontBody }}>Saldo por familia</div>
            <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
              {stats.balances.map((b) => (
                <div key={b.member.id} style={{ display: "flex", alignItems: "center", gap: 12, background: C.white, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "11px 14px" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: b.balance >= 0.005 ? `${C.teal}22` : b.balance <= -0.005 ? `${C.brick}22` : `${C.inkSoft}18`, display: "flex", alignItems: "center", justifyContent: "center", color: b.balance >= 0.005 ? C.teal : b.balance <= -0.005 ? C.brick : C.inkSoft, flexShrink: 0 }}>
                    {b.balance >= 0.005 ? <TrendingUp size={15} /> : b.balance <= -0.005 ? <TrendingDown size={15} /> : <Check size={15} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...fontBody, fontSize: 14.5, fontWeight: 600, color: C.ink }}>{b.member.name}</div>
                    <div style={{ ...fontBody, fontSize: 11.5, color: C.inkSoft }}>
                      {Math.abs(b.balance) < 0.005 ? "Al día con el bote" : b.balance > 0 ? "El bote le debe a él/ella" : "Debe dinero al bote"}
                    </div>
                  </div>
                  <div style={{ ...fontMono, fontSize: 15.5, fontWeight: 600, color: b.balance >= 0.005 ? C.teal : b.balance <= -0.005 ? C.brick : C.inkSoft }}>
                    {money(b.balance, trip.currencies.A.symbol)}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10, ...fontBody }}>Últimos movimientos</div>
            {sorted.length === 0 ? (
              <EmptyState onAdd={() => setShowAdd(true)} />
            ) : (
              <MovementList
                items={sorted.slice(0, 5)}
                memberName={memberName}
                symbolFor={symbolFor}
                typeLabel={typeLabel}
                typeTone={typeTone}
                onDelete={setConfirmDeleteId}
              />
            )}
          </div>
        )}

        {tab === "movimientos" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto" }}>
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>Todos</Chip>
              <Chip active={filter === "contribution"} onClick={() => setFilter("contribution")}>Aportes</Chip>
              <Chip active={filter === "expense"} onClick={() => setFilter("expense")}>Gastos</Chip>
            </div>
            {filtered.length === 0 ? (
              <EmptyState onAdd={() => setShowAdd(true)} />
            ) : (
              <MovementList items={filtered} memberName={memberName} symbolFor={symbolFor} typeLabel={typeLabel} typeTone={typeTone} onDelete={setConfirmDeleteId} />
            )}
          </div>
        )}

        {tab === "conversor" && (
          <div style={{ paddingBottom: 20 }}>
            <Converter trip={trip} standalone={false} />
          </div>
        )}

        {tab === "ajustes" && (
          <div style={{ paddingBottom: 10 }}>
            <p style={{ ...fontBody, fontSize: 13.5, color: C.inkSoft, marginBottom: 16 }}>
              Edita el nombre, la foto, las familias o la tasa de cambio de este viaje.
            </p>
            <Btn variant="primary" onClick={onEdit} full>
              <Settings size={16} /> Abrir ajustes del viaje
            </Btn>
          </div>
        )}
      </div>

      {/* FAB */}
      {tab !== "conversor" && tab !== "ajustes" && (
        <button
          onClick={() => setShowAdd(true)}
          style={{
            position: "fixed", right: 22, bottom: 26, width: 58, height: 58, borderRadius: "50%",
            background: C.brick, color: C.white, border: "none", boxShadow: "0 6px 18px rgba(178,58,46,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 20,
          }}
        >
          <Plus size={26} />
        </button>
      )}

      {showAdd && (
        <AddMovementSheet
          trip={trip}
          onClose={() => setShowAdd(false)}
          onSave={(mv) => { onAddMovement(mv); setShowAdd(false); }}
        />
      )}

      {confirmDeleteId && (
        <Sheet title="Eliminar movimiento" onClose={() => setConfirmDeleteId(null)}>
          <p style={{ ...fontBody, fontSize: 14, color: C.ink, marginBottom: 18 }}>
            Esto quitará el movimiento y recalculará los saldos del viaje. No se puede deshacer.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={() => setConfirmDeleteId(null)} full>Cancelar</Btn>
            <Btn variant="brick" onClick={() => { onDeleteMovement(confirmDeleteId); setConfirmDeleteId(null); }} full>
              <Trash2 size={15} /> Eliminar
            </Btn>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 14, padding: "28px 16px", textAlign: "center" }}>
      <div style={{ ...fontDisplay, fontSize: 16.5, color: C.ink, marginBottom: 4 }}>Aún no hay movimientos</div>
      <div style={{ ...fontBody, fontSize: 12.5, color: C.inkSoft, marginBottom: 12 }}>Registra la primera aportación o gasto del viaje.</div>
      <Btn variant="subtle" onClick={onAdd}><Plus size={15} /> Añadir movimiento</Btn>
    </div>
  );
}

function MovementList({ items, memberName, symbolFor, typeLabel, typeTone, onDelete }) {
  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
      {items.map((mv) => {
        const subLabel =
          mv.type === "contribution"
            ? mv.virtual ? " · compensa pago propio" : " · dinero al bote"
            : mv.reimbursement ? " · reembolso" : " · desde el bote";
        const personLine =
          mv.type === "contribution"
            ? memberName(mv.memberId)
            : mv.reimbursement ? `Reembolsado a ${memberName(mv.memberId)}` : "Pagado desde el bote";
        return (
          <div key={mv.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: C.white, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: typeTone[mv.type], flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ ...fontBody, fontSize: 11, fontWeight: 700, color: typeTone[mv.type], textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {typeLabel[mv.type]}{subLabel}
                </span>
              </div>
              <div style={{ ...fontBody, fontSize: 14.5, color: C.ink, fontWeight: 600, marginTop: 2 }}>
                {mv.description || (mv.type === "contribution" ? "Aporte al bote" : "Sin descripción")}
              </div>
              <div style={{ ...fontBody, fontSize: 12, color: C.inkSoft, marginTop: 2 }}>
                {personLine} · {fmtDate(mv.date)}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ ...fontMono, fontSize: 15, fontWeight: 600, color: C.ink }}>
                {money(mv.amount, symbolFor(mv.currencyCode))}
              </div>
              <button onClick={() => onDelete(mv.id)} style={{ background: "none", border: "none", color: C.inkSoft, cursor: "pointer", marginTop: 4, padding: 2 }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------
   ROOT APP
----------------------------------------------------------------*/
export default function App() {
  useFonts();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState([]); // full trip objects
  const [movementsByTrip, setMovementsByTrip] = useState({});
  const [route, setRoute] = useState("home"); // home | trip
  const [currentTripId, setCurrentTripId] = useState(null);
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [showEditTrip, setShowEditTrip] = useState(false);
  const [showConverter, setShowConverter] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [writeError, setWriteError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Every write updates React state first and persists after, so a failed save
  // is invisible: the movement sits on screen looking saved until someone
  // reloads and finds it gone. Cheap with localStorage, likely with a remote
  // backend (offline, wrong key, RLS policy). Wrap writes so they can't fail
  // quietly.
  const checked = async (promise) => {
    const ok = await promise;
    if (!ok) setWriteError(true);
    return ok;
  };

  const loadAllTrips = useCallback(async () => {
    const index = (await storeGet("trips-index")) || [];
    const loaded = [];
    for (const entry of index) {
      const full = await storeGet(`trip:${entry.id}`);
      if (full) loaded.push(full);
    }
    if (index.length > 0 && loaded.length === 0) setStorageError(true);
    setTrips(loaded);
  }, []);

  useEffect(() => {
    (async () => {
      await loadAllTrips();
      setLoading(false);
    })();
  }, [loadAllTrips]);

  const loadMovements = useCallback(async (tripId) => {
    const mv = (await storeGet(`movements:${tripId}`)) || [];
    setMovementsByTrip((prev) => ({ ...prev, [tripId]: mv }));
  }, []);

  const openTrip = async (id) => {
    setCurrentTripId(id);
    setRoute("trip");
    await loadMovements(id);
  };

  const refreshHome = async () => {
    setRefreshing(true);
    await loadAllTrips();
    setRefreshing(false);
  };

  const refreshTrip = async () => {
    if (!currentTripId) return;
    setRefreshing(true);
    await loadAllTrips();
    await loadMovements(currentTripId);
    setRefreshing(false);
  };

  const persistIndex = async (nextTrips) => {
    const index = nextTrips.map((t) => ({
      id: t.id, name: t.name, color: t.color, emoji: t.emoji, photo: null,
      memberCount: t.members.length, currencyA: t.currencies.A.code, currencyB: t.currencies.B.code,
    }));
    await checked(storeSet("trips-index", index));
  };

  const saveTrip = async (trip) => {
    const exists = trips.some((t) => t.id === trip.id);
    const next = exists ? trips.map((t) => (t.id === trip.id ? trip : t)) : [...trips, trip];
    setTrips(next);
    await checked(storeSet(`trip:${trip.id}`, trip));
    await persistIndex(next);
    setShowNewTrip(false);
    setShowEditTrip(false);
    if (!exists) await openTrip(trip.id);
  };

  const deleteTrip = async (id) => {
    const next = trips.filter((t) => t.id !== id);
    setTrips(next);
    await checked(storeDelete(`trip:${id}`));
    await checked(storeDelete(`movements:${id}`));
    await persistIndex(next);
    setShowEditTrip(false);
    setRoute("home");
    setCurrentTripId(null);
  };

  const addMovement = async (tripId, mv) => {
    const current = movementsByTrip[tripId] || [];
    const next = [...current, mv];
    setMovementsByTrip((prev) => ({ ...prev, [tripId]: next }));
    await checked(storeSet(`movements:${tripId}`, next));
  };

  const deleteMovement = async (tripId, mvId) => {
    const current = movementsByTrip[tripId] || [];
    const next = current.filter((m) => m.id !== mvId);
    setMovementsByTrip((prev) => ({ ...prev, [tripId]: next }));
    await checked(storeSet(`movements:${tripId}`, next));
  };

  const wipeAll = async () => {
    for (const t of trips) {
      await checked(storeDelete(`trip:${t.id}`));
      await checked(storeDelete(`movements:${t.id}`));
    }
    await checked(storeDelete("trips-index"));
    setTrips([]);
    setMovementsByTrip({});
    setRoute("home");
    setShowWipeConfirm(false);
  };

  const currentTrip = trips.find((t) => t.id === currentTripId);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={26} color={C.teal} style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.paper, ...fontBody }}>
      <style>{`
        * { box-sizing: border-box; }
        input:focus, select:focus, button:focus-visible { outline: 2.5px solid ${C.gold}; outline-offset: 1px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      {storageError && (
        <div style={{ background: C.brick, color: C.white, textAlign: "center", padding: "8px 14px", fontSize: 12.5 }}>
          No se pudieron cargar algunos viajes guardados.
        </div>
      )}

      {writeError && (
        <div style={{ background: C.brick, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 14px", fontSize: 12.5 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>
            No se pudo guardar el último cambio{isShared ? ". Comprueba tu conexión" : ""}. Puede
            desaparecer al recargar.
          </span>
          <button
            onClick={() => setWriteError(false)}
            style={{ background: "rgba(255,255,255,0.22)", border: "none", borderRadius: 6, color: C.white, cursor: "pointer", fontSize: 11.5, padding: "3px 8px", ...fontBody }}
          >
            Entendido
          </button>
        </div>
      )}

      {route === "home" && (
        <Home
          trips={trips}
          onOpen={openTrip}
          onNew={() => setShowNewTrip(true)}
          onConverter={() => setShowConverter(true)}
          onWipe={() => setShowWipeConfirm(true)}
          onRefresh={refreshHome}
          refreshing={refreshing}
        />
      )}

      {route === "trip" && currentTrip && (
        <TripDetail
          trip={currentTrip}
          movements={movementsByTrip[currentTrip.id] || []}
          onBack={() => { setRoute("home"); setCurrentTripId(null); }}
          onEdit={() => setShowEditTrip(true)}
          onAddMovement={(mv) => addMovement(currentTrip.id, mv)}
          onDeleteMovement={(mvId) => deleteMovement(currentTrip.id, mvId)}
          onRefresh={refreshTrip}
          refreshing={refreshing}
        />
      )}

      {showNewTrip && (
        <TripForm onCancel={() => setShowNewTrip(false)} onSave={saveTrip} />
      )}

      {showEditTrip && currentTrip && (
        <TripForm initial={currentTrip} onCancel={() => setShowEditTrip(false)} onSave={saveTrip} onDelete={() => deleteTrip(currentTrip.id)} />
      )}

      {showConverter && (
        <Converter trip={null} standalone onClose={() => setShowConverter(false)} />
      )}

      {showWipeConfirm && (
        <Sheet title="Borrar todos los datos" onClose={() => setShowWipeConfirm(false)}>
          <p style={{ ...fontBody, fontSize: 14, color: C.ink, marginBottom: 18 }}>
            Se eliminarán todos los viajes, familias y movimientos guardados
            {isShared ? " en el bote compartido, para todo el mundo" : " en este dispositivo"}.
            Esta acción no se puede deshacer.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={() => setShowWipeConfirm(false)} full>Cancelar</Btn>
            <Btn variant="brick" onClick={wipeAll} full><Trash2 size={15} /> Borrar todo</Btn>
          </div>
        </Sheet>
      )}
    </div>
  );
}