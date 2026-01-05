import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= Discord Bot ================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(" Discord bot logged in");
});

/* ================= In-memory DB ================= */

const requests = {};

/* ================= Upload ================= */

const uploadDir = path.join(process.cwd(), "public/uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  })
});

/* ================= Middleware ================= */

app.use(express.static("public"));
app.use("/uploads", express.static(uploadDir));

/* ================= Upload API ================= */

app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    const id = Date.now().toString();
    const filename = path.basename(req.file.path);
    const imageUrl = `/uploads/${filename}`;

    requests[id] = {
      status: "pending",
      result: null,
      imageUrl
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("잘생김")
        .setStyle(ButtonStyle.Primary)
        .setCustomId(`rate:${id}:잘생김`),
      new ButtonBuilder()
        .setLabel("예쁨")
        .setStyle(ButtonStyle.Primary)
        .setCustomId(`rate:${id}:예쁨`),
      new ButtonBuilder()
        .setLabel("귀여움")
        .setStyle(ButtonStyle.Primary)
        .setCustomId(`rate:${id}:귀여움`),
      new ButtonBuilder()
        .setLabel("못생김")
        .setStyle(ButtonStyle.Danger)
        .setCustomId(`rate:${id}:못생김`)
    );

    const channel = await client.channels.fetch(
      process.env.DISCORD_CHANNEL_ID
    );

    await channel.send({
      content: ` 얼굴 평가\nID: ${id}\n\n!rate ${id} <결과> 도 가능`,
      files: [path.join(uploadDir, filename)],
      components: [row]
    });

    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "upload failed" });
  }
});

/* ================= Result API ================= */

app.get("/result/:id", (req, res) => {
  const data = requests[req.params.id];
  if (!data) return res.status(404).json({ error: "없음" });
  res.json(data);
});

/* ================= Button Interaction ================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  const [, id, result] = interaction.customId.split(":");

  if (!requests[id] || requests[id].status === "done") {
    return interaction.reply({
      content: "이미 평가됨",
      ephemeral: true
    });
  }

  requests[id].status = "done";
  requests[id].result = result;

  await interaction.reply({
    content: `평가 결과: **${result}**`,
    ephemeral: true
  });
});

/* ================= !rate Command ================= */

client.on("messageCreate", async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("!rate")) return;

  const [, id, result] = msg.content.split(" ");
  if (!id || !result) {
    return msg.reply("사용법: !rate <id> <결과>");
  }

  if (!requests[id]) {
    return msg.reply("해당 ID 없음");
  }

  if (requests[id].status === "done") {
    return msg.reply("이미 평가됨");
  }

  requests[id].status = "done";
  requests[id].result = result;

  msg.reply(`평가 완료: **${result}**`);
});

/* ================= Start ================= */

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
