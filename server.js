import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import nacl from "tweetnacl";

const app = express();
const PORT = process.env.PORT || 10000;

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

/* ========================
   기본 체크 로그
======================== */
console.log("BOT TOKEN 존재:", !!DISCORD_BOT_TOKEN);
console.log("PUBLIC KEY 존재:", !!DISCORD_PUBLIC_KEY);
console.log("CHANNEL ID:", DISCORD_CHANNEL_ID);

/* ========================
   업로드 폴더
======================== */
const uploadDir = path.join(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* ========================
   multer 설정
======================== */
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    },
  }),
});

/* ========================
   메모리 저장소
======================== */
const requests = {};

/* ========================
   미들웨어
======================== */
app.use("/uploads", express.static(uploadDir));
app.use(express.static("public"));

/* ========================
   메인 페이지
======================== */
app.get("/", (_, res) => {
  res.sendFile(path.resolve("public/index.html"));
});

/* ========================
   업로드 처리
======================== */
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

    /* ===== 디스코드 메시지 전송 ===== */
    const discordPayload = {
      content: `얼굴 평가 요청\nID: ${id}`,
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
    };

    const discordRes = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(discordPayload),
      }
    );

    const discordText = await discordRes.text();

    console.log("=== Discord API RESPONSE ===");
    console.log("STATUS:", discordRes.status);
    console.log("BODY:", discordText);
    console.log("============================");

    if (!discordRes.ok) {
      return res.status(500).json({
        error: "디스코드 메시지 전송 실패",
        discordStatus: discordRes.status,
        discordBody: discordText,
      });
    }

    res.json({ id, status: "pending", imageUrl });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: "서버 오류" });
  }
});

/* ========================
   Discord Interactions
======================== */
app.post(
  "/discord/interactions",
  express.json({
    verify: (req, _, buf) => {
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
      console.log("❌ Discord signature invalid");
      return res.status(401).end("invalid request");
    }

    const { type, data } = req.body;

    // Ping
    if (type === 1) {
      return res.json({ type: 1 });
    }

    // 버튼 클릭
    if (type === 3) {
      const [, id, result] = data.custom_id.split(":");

      if (!requests[id] || requests[id].status === "done") {
        return res.json({
          type: 4,
          data: { content: "이미 처리됨", flags: 64 },
        });
      }

      requests[id].status = "done";
      requests[id].result = result;

      return res.json({
        type: 4,
        data: {
          content: `평가 완료: **${result}**`,
          flags: 64,
        },
      });
    }

    return res.json({ type: 5 });
  }
);

/* ========================
   결과 조회
======================== */
app.get("/result/:id", (req, res) => {
  const data = requests[req.params.id];
  if (!data) return res.status(404).json({ error: "없음" });
  res.json(data);
});

/* ========================
   서버 시작
======================== */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
