import express from "express";
import fetch from "node-fetch";
import FormData from "form-data";
import nacl from "tweetnacl";
import dotenv from "dotenv";
import "./bot.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

/* =========================
   Interaction 검증
========================= */
function verifyDiscord(req) {
  const sig = req.headers["x-signature-ed25519"];
  const ts = req.headers["x-signature-timestamp"];
  return nacl.sign.detached.verify(
    Buffer.from(ts + req.rawBody),
    Buffer.from(sig, "hex"),
    Buffer.from(process.env.DISCORD_PUBLIC_KEY, "hex")
  );
}

/* =========================
   Discord 버튼 처리
========================= */
app.post("/interactions", (req, res) => {
  if (!verifyDiscord(req)) return res.status(401).end();

  const interaction = req.body;

  if (interaction.type === 1) {
    return res.json({ type: 1 });
  }

  if (interaction.type === 3) {
    return res.json({
      type: 4,
      data: {
        content: "⭐ 평가 완료!",
        flags: 64
      }
    });
  }
});

/* =========================
   사진 업로드 → Discord Webhook
========================= */
app.post("/upload", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const buffer = Buffer.from(imageBase64, "base64");

    const form = new FormData();
    form.append("file", buffer, {
      filename: "face.png",
      contentType: "image/png"
    });

    form.append("payload_json", JSON.stringify({
      content: "📸 새로운 얼굴 평가 요청",
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              label: "평가하기",
              style: 1,
              custom_id: "rate_btn"
            }
          ]
        }
      ]
    }));

    await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      body: form
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "upload fail" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
