import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import nacl from "tweetnacl";
import { fileURLToPath } from "url";

// ===== 기본 설정 =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// ===== ENV =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// ===== 업로드 폴더 =====
const uploadDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ===== multer =====
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) =>
      cb(null, Date.now() + path.extname(file.originalname)),
  }),
});

// ===== 메모리 저장소 =====
const requests = {};

// ===== 미들웨어 =====
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));

// ===== 메인 페이지 (🔥 Cannot GET / 해결) =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ===== 업로드 =====
app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "파일 없음" });
    }

    const id = Date.now().toString();
    const imageUrl = `/uploads/${path.basename(req.file.path)}`;

    requests[id] = {
      status: "pending",
      result: null,
      imageUrl,
    };

    // ===== Discord 메시지 =====
    const discordRes = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: `📸 얼굴 평가 요청\nID: ${id}\n${process.env.PUBLIC_URL}${imageUrl}`,
          components: [
            {
              type: 1,
              components: [
                { type: 2, label: "잘생김", style: 1, custom_id: `rate:${id}:잘생김` },
                { type: 2, label: "예쁨", style: 1, custom_id: `rate:${id}:예쁨` },
                { type: 2, label: "귀여움", style: 1, custom_id: `rate:${id}:귀여움` },
                { type: 2, label: "못생김", style: 4, custom_id: `rate:${id}:못생김` },
              ],
            },
          ],
        }),
      }
    );

    if (!discordRes.ok) {
      const t = await discordRes.text();
      console.error("❌ Discord 전송 실패:", t);
    }

    res.json({ id, imageUrl });

  } catch (err) {
    console.error("❌ 업로드 에러:", err);
    res.status(500).json({ error: "upload failed" });
  }
});

// ===== Discord Interactions =====
app.post(
  "/discord/interactions",
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  (req, res) => {
    const sig = req.headers["x-signature-ed25519"];
    const ts = req.headers["x-signature-timestamp"];

    const isValid = nacl.sign.detached.verify(
      Buffer.from(ts + req.rawBody),
      Buffer.from(sig, "hex"),
      Buffer.from(DISCORD_PUBLIC_KEY, "hex")
    );

    if (!isValid) {
      return res.status(401).send("invalid request signature");
    }

    const { type, data } = req.body;

    // Discord PING
    if (type === 1) {
      return res.json({ type: 1 });
    }

    // 버튼 클릭
    if (type === 3) {
      const [, id, result] = data.custom_id.split(":");

      if (!requests[id] || requests[id].status === "done") {
        return res.json({
          type: 4,
          data: { content: "이미 평가됨", flags: 64 },
        });
      }

      requests[id].status = "done";
      requests[id].result = result;

      return res.json({
        type: 4,
        data: { content: `✅ 평가 완료: **${result}**`, flags: 64 },
      });
    }

    res.json({ type: 5 });
  }
);

// ===== 결과 조회 =====
app.get("/result/:id", (req, res) => {
  const data = requests[req.params.id];
  if (!data) return res.status(404).json({ error: "없음" });
  res.json(data);
});

// ===== 서버 시작 =====
app.listen(PORT, () => {
  console.log("✅ Server running on", PORT);
});
