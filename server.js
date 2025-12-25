import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import nacl from "tweetnacl";
import FormData from "form-data";
import { Client, GatewayIntentBits } from "discord.js";

const app = express();
const PORT = process.env.PORT || 10000;

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const MASTER_DISCORD_ID = process.env.MASTER_DISCORD_ID;

/* =========================
   업로드 폴더
========================= */
const uploadDir = path.join(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

/* =========================
   multer 설정
========================= */
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    },
  }),
});

/* =========================
   메모리 저장소
========================= */
const requests = {};

/* =========================
   정적 파일
========================= */
app.use("/uploads", express.static(uploadDir));
app.use(express.static("public"));

app.get("/", (_, res) => {
  res.sendFile(path.resolve("public/index.html"));
});

/* =========================
   업로드 + Discord 전송
========================= */
app.post("/upload", upload.single("photo"), async (req, res) => {
  const id = Date.now().toString();
  const imagePath = req.file.path;
  const imageUrl = `/uploads/${path.basename(imagePath)}`;

  requests[id] = {
    status: "pending",
    result: null,
    imageUrl,
  };

  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content: `@everyone 얼굴 평가 요청\nID: ${id}\n\n!rate ${id} 결과`,
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
    })
  );

  form.append("files[0]", fs.createReadStream(imagePath));

  await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
    body: form,
  });

  res.json({ id, status: "pending", imageUrl });
});

/* =========================
   Discord Interactions
========================= */
app.post(
  "/discord/interactions",
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  (req, res) => {
    const signature = req.headers["x-signature-ed25519"];
    const timestamp = req.headers["x-signature-timestamp"];

    const isValid = nacl.sign.detached.verify(
      Buffer.from(timestamp + req.rawBody),
      Buffer.from(signature, "hex"),
      Buffer.from(DISCORD_PUBLIC_KEY, "hex")
    );

    if (!isValid) {
      return res.status(401).send("Invalid signature");
    }

    const interaction = req.body;

    // ✅ Discord URL 검증용 Ping
    if (interaction.type === 1) {
      return res.json({ type: 1 });
    }

    // 버튼 클릭
    if (interaction.type === 3) {
      const [_, id, result] = interaction.data.custom_id.split(":");

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
        data: { content: `판정 완료: **${result}**`, flags: 64 },
      });
    }

    return res.status(400).end();
  }
);

/* =========================
   결과 조회
========================= */
app.get("/result/:id", (req, res) => {
  const data = requests[req.params.id];
  if (!data) return res.status(404).json({ error: "없음" });
  res.json(data);
});

/* =========================
   Discord Gateway Bot (!rate)
========================= */
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

bot.once("ready", () => {
  console.log("Discord Gateway bot ready");
});

bot.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (message.author.id !== MASTER_DISCORD_ID) return;
  if (!message.content.startsWith("!rate")) return;

  const parts = message.content.trim().split(" ");
  if (parts.length < 3) {
    message.reply("형식: !rate <id> <결과>");
    return;
  }

  const id = parts[1];
  const result = parts.slice(2).join(" ");

  if (!requests[id]) {
    message.reply("ID 없음");
    return;
  }

  if (requests[id].status === "done") {
    message.reply("이미 판정됨");
    return;
  }

  requests[id].status = "done";
  requests[id].result = result;

  message.reply(`판정 완료 ✅\nID: ${id}\n결과: **${result}**`);
});

bot.login(DISCORD_BOT_TOKEN);

/* =========================
   서버 시작
========================= */
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
