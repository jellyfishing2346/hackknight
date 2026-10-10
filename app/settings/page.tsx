"use client";
import { useEffect, useState } from "react";
import { Brand } from "@/app/components/Brand";
import { readProfile, saveProfile } from "@/app/components/profile";

/** Your Tabby profile on this device: who you are, and where payments should land. */
export default function Settings() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [wallet, setWallet] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = readProfile();
    setUsername(p.username);
    setEmail(p.email);
    setPhone(p.phone);
    setWallet(p.wallet);
  }, []);

  function save() {
    saveProfile({ username: username.trim(), email: email.trim(), phone: phone.trim(), wallet: wallet.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="page">
      <Brand />
      <h1>Your profile</h1>
      <p className="lede">
        Saved on this device only. It auto-fills your name and wallet next time you host a tab or pay someone back.
      </p>

      <div className="host-card">
        <div className="field">
          <label htmlFor="username">Tabby username</label>
          <input id="username" placeholder="e.g. sam" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" placeholder="sam@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone number</label>
          <input id="phone" type="tel" autoComplete="tel" placeholder="(555) 555-5555" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="wallet">Payment method: Solana wallet</label>
          <input
            id="wallet"
            className="mono"
            placeholder="Your Solana address"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
          />
          <span className="hint">Used as your default payout address when you host, and your default pay-from wallet when you're a guest.</span>
        </div>
      </div>

      <button className="btn block big" onClick={save}>{saved ? "Saved!" : "Save profile"}</button>
    </main>
  );
}
