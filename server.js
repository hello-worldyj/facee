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

// ===== 업로드 폴더 =====
const uploadDir = path.join(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ===== multer =====
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) =>
      cb(null, Date.now() + path.extname(file.originalname)),
  }),
});

// ===== 임시 저장소 =====
const requests = {};

// ===== 정적 파일 =====
app.use("/uploads", express.static(uploadDir));
app.use(express.static("public"));

// ===== 메인 페이지 =====
app.get("/", (_, res) => {
  res.sendFile(path.resolve("public/index.html"));
});

// ===== 업로드 =====
app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    const id = Date.now().toString();
    const imageUrl = `/uploads/${path.basename(req.file.path)}`;

    requests[id] = {
      status: "pending",
      result: null,
      imageUrl,
    };

    // ===== Discord 메시지 =====
    try {
      const discordRes = await fetch(
        `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: `@everyone 얼굴 평가 요청\nID: ${id}`,
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
        console.error("❌ Discord 전송 실패");
        console.error(await discordRes.text());
      }
    } catch (e) {
      console.error("❌ Discord fetch 에러:", e.message);
    }

    // 🔥 무조건 성공 응답
    res.json({ id, status: "pending", imageUrl });

  } catch (err) {
    console.error("❌ 업로드 에러:", err);
    res.status(500).json({ error: "upload failed" });
  }
});

// ===== Discord Interactions =====
app.post(
  "/discord/interactions",
  express.json({
    verify: (req, _, buf) => (req.rawBody = buf),
  }),
  (req, res) => {
    const sig = req.headers["x-signature-ed25519"];
    const ts = req.headers["x-signature-timestamp"];

    const ok = nacl.sign.detached.verify(
      Buffer.from(ts + req.rawBody),
      Buffer.from(sig, "hex"),
      Buffer.from(DISCORD_PUBLIC_KEY, "hex")
    );

    if (!ok) return res.status(401).end("bad request");

    const { type, data } = req.body;

    if (type === 1) return res.json({ type: 1 });

    if (type === 3) {
      const [, id, result] = data.custom_id.split(":");

      if (!requests[id] || requests[id].status === "done") {
        return res.json({
          type: 4,
          data: { content: "이미 판정됨", flags: 64 },
        });
      }

      requests[id].status = "done";
      requests[id].result = result;

      return res.json({
        type: 4,
        data: { content: `평가 완료: **${result}**`, flags: 64 },
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

// ===== 시작 =====
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
app.get("/test-discord", async (req, res) => {
  try {
    const r = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "✅ 테스트 메시지 (서버에서 직접 보냄)",
        }),
      }
    );

    const text = await r.text();
    res.send({ status: r.status, text });
  } catch (e) {
    res.status(500).send(e.message);
  }
});

