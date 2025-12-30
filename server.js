import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import nacl from "tweetnacl";

const app = express();
const PORT = process.env.PORT || 10000;

// ===== 환경변수 =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// ===== 요청 저장소 (bot.js 와 공유) =====
global.requests = {};

// ===== 업로드 폴더 =====
const uploadDir = path.join(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ===== multer =====
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  })
});

// ===== static =====
app.use("/uploads", express.static(uploadDir));
app.use(express.static("public"));

// ===== 메인 =====
app.get("/", (_, res) => {
  res.sendFile(path.resolve("public/index.html"));
});

// ===== 업로드 =====
app.post("/upload", upload.single("photo"), async (req, res) => {
  const id = Date.now().toString();
  const imageUrl = `/uploads/${path.basename(req.file.path)}`;

  global.requests[id] = {
    status: "pending",
    result: null,
    imageUrl
  };

  // 디스코드 메시지 + 버튼
  await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: `📸 얼굴 평가 요청\nID: ${id}\n\n버튼 클릭 또는\n!rate ${id} 결과`,
      components: [
        {
          type: 1,
          components: [
            { type: 2, label: "잘생김", style: 1, custom_id: `rate:${id}:잘생김` },
            { type: 2, label: "예쁨", style: 1, custom_id: `rate:${id}:예쁨` },
            { type: 2, label: "귀여움", style: 1, custom_id: `rate:${id}:귀여움` },
            { type: 2, label: "못생김", style: 4, custom_id: `rate:${id}:못생김` }
          ]
        }
      ]
    })
  });

  res.json({ id, status: "pending", imageUrl });
});

// ===== Discord Interaction =====
app.post(
  "/discord/interactions",
  express.json({
    verify: (req, _, buf) => {
      req.rawBody = buf;
    }
  }),
  (req, res) => {
    const sig = req.headers["x-signature-ed25519"];
    const ts = req.headers["x-signature-timestamp"];

    const isValid = nacl.sign.detached.verify(
      Buffer.from(ts + req.rawBody),
      Buffer.from(sig, "hex"),
      Buffer.from(DISCORD_PUBLIC_KEY, "hex")
    );

    if (!isValid) return res.status(401).end("invalid request");

    const { type, data } = req.body;

    // Ping
    if (type === 1) return res.json({ type: 1 });

    // 버튼
    if (type === 3) {
      const [, id, result] = data.custom_id.split(":");

      if (!global.requests[id] || global.requests[id].status === "done") {
        return res.json({
          type: 4,
          data: { content: "이미 처리됨", flags: 64 }
        });
      }

      global.requests[id].status = "done";
      global.requests[id].result = result;

      return res.json({
        type: 4,
        data: { content: `평완: **${result}**`, flags: 64 }
      });
    }

    return res.json({ type: 5 });
  }
);

// ===== 결과 조회 =====
app.get("/result/:id", (req, res) => {
  const item = global.requests[req.params.id];
  if (!item) return res.status(404).json({ error: "없음" });
  res.json(item);
});

// ===== 시작 =====
app.listen(PORT, () => {
  console.log("🔥 Server running on", PORT);
});
