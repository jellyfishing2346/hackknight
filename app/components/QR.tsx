"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QR({ value, alt }: { value: string; alt: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 480, color: { dark: "#1c2228", light: "#ffffff" } }).then(setSrc);
  }, [value]);
  return src ? <img src={src} alt={alt} /> : <div style={{ aspectRatio: "1" }} />;
}
