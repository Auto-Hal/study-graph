import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const nodes = [
    { left: 46, top: 42, tone: "#f4f2ed" },
    { left: 92, top: 28, tone: "#d9c8aa" },
    { left: 126, top: 62, tone: "#f4f2ed" },
    { left: 112, top: 117, tone: "#d9c8aa" },
    { left: 65, top: 128, tone: "#f4f2ed" },
    { left: 30, top: 89, tone: "#d9c8aa" },
  ];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: "#243c2c",
        borderRadius: 40,
      }}
    >
      <svg width="180" height="180" viewBox="0 0 180 180" style={{ position: "absolute", inset: 0 }}>
        <path d="M52 53 L103 39 L137 74 L122 131 L71 143 L40 101 Z" fill="none" stroke="#e9e5dc" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M103 39 L90 93 L137 74 M90 93 L122 131 M90 93 L40 101" fill="none" stroke="#aebda9" strokeWidth="8" strokeLinecap="round" />
      </svg>
      {nodes.map((node, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: node.left,
            top: node.top,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: node.tone,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 72,
          top: 75,
          width: 38,
          height: 38,
          borderRadius: 999,
          background: "#f4f2ed",
          border: "6px solid #243c2c",
        }}
      />
    </div>,
    size,
  );
}
