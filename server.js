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

/* Discord */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log("Discord bot logged in");
});

/* 메모리 저장 */
const requests = {};

/* 업로드 설정 */
const uploadDir = path.join(process.cwd(), "public/uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) =>
      cb(null, Date.now() + path.extname(file.originalname))
  })
});

app.use(express.static("public"));
app.use("/uploads", express.static(uploadDir));

/* 업로드 */
app.post("/upload", upload.single("photo"), async (req, res) => {
  const id = Date.now().toString();
  const filename = path.basename(req.file.path);
  const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${filename}`;

  requests[id] = {
    status: "pending",
    result: null,
    imageUrl
  };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("잘생김").setStyle(ButtonStyle.Primary).setCustomId(`rate:${id}:잘생김`),
    new ButtonBuilder().setLabel("예쁨").setStyle(ButtonStyle.Primary).setCustomId(`rate:${id}:예쁨`),
    new ButtonBuilder().setLabel("귀여움").setStyle(ButtonStyle.Primary).setCustomId(`rate:${id}:귀여움`),
    new ButtonBuilder().setLabel("못생김").setStyle(ButtonStyle.Danger).setCustomId(`rate:${id}:못생김`)
  );

  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
  await channel.send({
    content: "@everyone 얼굴 평가 요청\nID: " + id + "\n!rate " + id + " <결과>",
    files: [path.join(uploadDir, filename)],
    components: [row]
  });

  res.json({ id });
});

/* 결과 */
app.get("/result/:id", (req, res) => {
  const data = requests[req.params.id];
  if (!data) return res.status(404).json({ error: "없음" });
  res.json(data);
});

/* 버튼 */
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  const [, id, result] = interaction.customId.split(":");
  const data = requests[id];
  if (!data) return;

  if (data.status === "done") {
    return interaction.reply({
      content: "이미 평가된 사진",
      ephemeral: true
    });
  }

  data.status = "done";
  data.result = result;

  const disabledRow = new ActionRowBuilder().addComponents(
    interaction.message.components[0].components.map(b =>
      ButtonBuilder.from(b).setDisabled(true)
    )
  );

  await interaction.update({
    content: interaction.message.content + "\n결과: " + result,
    components: [disabledRow]
  });
});

/* !rate */
client.on("messageCreate", msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("!rate")) return;

  const [, id, result] = msg.content.split(" ");
  if (!id || !result) {
    return msg.reply("사용법: !rate <id> <결과>");
  }

  const data = requests[id];
  if (!data) return msg.reply("ID 없음");

  if (data.status === "done") {
    return msg.reply("이미 평가된 사진");
  }

  data.status = "done";
  data.result = result;

  msg.reply("평가 완료: " + result);
});

/* 시작 */
app.listen(PORT, () => {
  console.log("Server running on " + PORT);
});

client.login(process.env.DISCORD_BOT_TOKEN);
