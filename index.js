import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import express from "express";
// import input from "input";
import { DownloaderHelper } from "node-downloader-helper";
import ffmpeg from "fluent-ffmpeg";
import { v4 as uuidv4 } from "uuid";

import dotenv from "dotenv";
import fs, { promises as fsPromises } from "fs";
import path from "path";
import { NewMessage } from "telegram/events/index.js";

dotenv.config();

const app = express();

app.use(express.static("./downloads"));

app.get("/", (req, res) => {
    res.send("Hello");
});

app.listen(3000, () => {
    console.log("listening");
});

const apiId = parseInt(process.env.APP_API_ID);
const apiHash = process.env.APP_API_HASH;

// const stringSession = process.env.APP_SESSION; // leave this empty for now
const stringSession = process.env.APP_SESSION_BOT; // leave this empty for now
const BOT_TOKEN = process.env.bot; // put your bot token here

(async () => {
    const client = new TelegramClient(
        new StringSession(stringSession),
        apiId,
        apiHash,
        {
            connectionRetries: 5,
        }
    );

    if (stringSession) {
        console.log("connecting");
        await client.connect();
    } else {
        await client.start({
            botAuthToken: BOT_TOKEN,
        });

        console.log(client.session.save());
    }

    client.addEventHandler(async (update) => {
        const chatID = Number(update.message.chatId);

        if (update.message.message.startsWith("/start")) {
            await client.sendMessage(chatID, {
                message: "Welcome to my Telegram bot!",
            });
        }

        if (
            update.message.message.startsWith("https") ||
            update.message.message.startsWith("http")
        ) {
            const videoURL = update.message.message;

            await client.sendMessage(chatID, {
                message: `Downloading Video at ${videoURL}`,
            });

            if (!fs.existsSync("./downloads")) {
                await fsPromises.mkdir("./downloads");
            }

            const fileName = path.basename(videoURL);
            const filePath = `./downloads/${fileName}`;

            const dl = new DownloaderHelper(videoURL, "./downloads", {
                fileName,
            });

            dl.on("end", async () => {
                if (!fs.existsSync("./thumbnail")) {
                    await fsPromises.mkdir("./thumbnail");
                }

                ffmpeg.ffprobe(filePath, async (error, metadata) => {
                    const duration = metadata.format.duration;
                    const timeIndex = "00:00:10";

                    ffmpeg(filePath)
                        .on("end", async function () {
                            try {
                                await client.sendMessage(chatID, {
                                    message: "Uploading video to telegram",
                                });

                                await client.sendFile(chatID, {
                                    file: filePath,
                                    caption: fileName,
                                    workers: 8,
                                    thumb: "./thumbnail/thumbnail.jpg",
                                    attributes: [
                                        new Api.DocumentAttributeVideo({
                                            w: 640,
                                            h: 480,
                                            supportsStreaming: true,
                                            duration,
                                        }),
                                    ],
                                    progressCallback: (pro) => {
                                        console.log(
                                            "Uplaoded: " +
                                                Math.ceil(pro * 100) +
                                                "%"
                                        );
                                    },
                                });
                            } catch (error) {
                                console.log(error);
                            }

                            await fsPromises.rm(`./downloads/${fileName}`);
                            await fsPromises.rm(`./thumbnail/thumbnail.jpg`);

                            await client.sendMessage(chatID, {
                                message: "You can send new url",
                            });
                        })
                        .on("error", function (err) {
                            console.error(err);
                        })
                        .screenshots({
                            count: 1,
                            timemarks: [timeIndex],
                            filename: "thumbnail.jpg",
                            folder: "./thumbnail",
                        });
                });
            });

            dl.on("error", (err) => console.log("Download Failed", err));

            dl.on("progress", (c) =>
                console.log(`${c.progress} / ${c.downloaded} / ${c.total}`)
            );

            dl.start().catch((err) => console.error(err));
        }
    }, new NewMessage({}));
})();

process.on("uncaughtException", (err) => {
    console.log(err);
    process.exit(1);
});
