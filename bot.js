import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const requests = global.requests; // server.js 와 공유

client.once("ready", () => {
  console.log("🤖 !rate 봇 로그인 완료");
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("!rate")) return;

  const parts = msg.content.split(" ");
  if (parts.length < 3) {
    msg.reply("형식: !rate <ID> <평가>");
    return;
  }

  const id = parts[1];
  const result = parts.slice(2).join(" ");

  if (!requests[id]) {
    msg.reply("❌ 해당 ID 없음");
    return;
  }

  if (requests[id].status === "done") {
    msg.reply("❌ 이미 평가됨");
    return;
  }

  requests[id].status = "done";
  requests[id].result = result;

  msg.reply(`✅ 평가 완료: **${result}**`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
