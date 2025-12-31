import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Discord =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== 메모리 DB =====
const requests = {};

// ===== 업로드 =====
const uploadDir = path.join(process.cwd(), "public/uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) =>
      cb(null, Date.now() + path.extname(file.originalname))
  })
});

// ===== 미들웨어 =====
app.use(express.static("public"));
app.use("/uploads", express.static(uploadDir));

// ===== 업로드 API =====
app.post("/upload", upload.single("photo"), async (req, res) => {
  const id = Date.now().toString();
  const imageUrl = `/uploads/${path.basename(req.file.path)}`;

  requests[id] = { status:"pending", result:null, imageUrl };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("잘생김").setStyle(ButtonStyle.Primary).setCustomId(`rate:${id}:잘생김`),
    new ButtonBuilder().setLabel("예쁨").setStyle(ButtonStyle.Primary).setCustomId(`rate:${id}:예쁨`),
    new ButtonBuilder().setLabel("귀여움").setStyle(ButtonStyle.Primary).setCustomId(`rate:${id}:귀여움`),
    new ButtonBuilder().setLabel("못생김").setStyle(ButtonStyle.Danger).setCustomId(`rate:${id}:못생김`)
  );

  await client.channels.cache
    .get(process.env.DISCORD_CHANNEL_ID)
    .send({
      content: ` @everyone 얼굴 평가\nID: ${id}\n!rate ${id} <결과> 도 가능`,
      files: [ path.join(uploadDir, path.basename(req.file.path)) ],
      components: [row]
    });

  res.json({ id });
});

// ===== 결과 조회 =====
app.get("/result/:id", (req, res) => {
  const d = requests[req.params.id];
  if (!d) return res.status(404).json({ error:"없음" });
  res.json(d);
});

// ===== Discord 버튼 =====
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  const [, id, result] = i.customId.split(":");

  if (!requests[id] || requests[id].status === "done")
    return i.reply({ content:"이미 평가됨", ephemeral:true });

  requests[id].status = "done";
  requests[id].result = result;

  i.reply({ content:`✅ 평가: ${result}`, ephemeral:true });
});

// ===== !rate 메시지 =====
client.on("messageCreate", msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("!rate")) return;

  const [, id, result] = msg.content.split(" ");
  if (!requests[id]) return msg.reply("❌ ID 없음");

  requests[id].status = "done";
  requests[id].result = result;

  msg.reply(`✅ 평가 완료: ${result}`);
});

// ===== 시작 =====
client.login(process.env.DISCORD_BOT_TOKEN);
app.listen(PORT, () => console.log("Server on", PORT));
