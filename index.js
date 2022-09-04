import fs from 'fs';
import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import bodyParser from 'body-parser';
import multer from "multer"
import { addMetadataToWebpBuffer, setMetadata } from 'wa-sticker-formatter';
import sharp from 'sharp'
import { PassThrough } from 'node:stream';

const app = express();
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())
const upload = multer({ dest: 'publico/' });
const getRandom = (ext) => { return `${Math.floor(Math.random() * 10000)}${ext}` }
const porta = process.env.PORT || 3000

const defaultAutor = 'T.bot Figurinhas'
const defaultPack = 'bot.figurinhas.cf'


app.set('json spaces', 4)

app.listen(porta, function () {
    console.log("Listening on port ", porta)
    if (porta == 3000) { console.log('rodando localmente em http://localhost:3000') }
});

app.get('/', async function (req, res) {
    res.send('ok')
})

app.post('/webp', upload.single('file'), async function (req, res) {
    let {pack, autor} = req.body
    pack = pack ? pack : defaultPack
    autor = autor ? autor : defaultAutor
    console.log(req.file)
    switch (req.file.mimetype) {
        case "video/mp4":
            let fileStream = fs.createReadStream(req.file.path)
            let sticker = await stickerAnimated(fileStream, false)
            let webpWithMetadata = await addMetadataToWebpBuffer(sticker, pack, autor)
            fs.writeFileSync((req.file.path+".webp"), webpWithMetadata)
            res.download((req.file.path+".webp"))
            break;

        case "image/gif":
        case "image/png":
        case "image/jpeg":
            let webp = await toWebp(req.file.path, false, req.file.path)
            let withMetadata = await setMetadata(pack, autor, webp)
            fs.writeFileSync((req.file.path+".webp"), withMetadata)
            res.download((req.file.path+".webp"))
            break;

        default:
            return res.send("formato invalido")
    }
})

async function toPngBuffer(file) {
    return new Promise(async (resolve, reject) => {
        sharp(file)
            .png({ force: true })
            .toBuffer((err, data, info) => {
                if (err) {
                    console.error(err);
                    return reject(err)
                }
                return resolve(data)
            });
    })
}
async function toGif(file) {
    var fim = file.replace('.mp4', '.gif')
    return new Promise(async (resolve, reject) => {
        ffmpeg(file)
            .addOutputOption([
                '-ss', '00', '-t', '10', '-vf',
                'fps=10,scale=400:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
                '-loop', '0'
            ])
            .toFormat('gif')
            .save(fim)
            .on('end', () => { resolve(fim) })
            .on('error', () => { reject(null) })
    })

}
async function toWebp(file, crop, name) {
    var fim = name.replace('.jpeg', '').replace('.png', '').replace('.gif', '')
    fim = fim + '.webp'

    var isCrop = crop ? {
        width: 400,
        height: 400,
        fit: sharp.fit.cover
    } : {
        fit: sharp.fit.contain,
        width: 400,
        height: 400,
        background: { r: 0, b: 0, g: 0, alpha: 0 }
    }

    return new Promise(async (resolve, reject) => {
        sharp(file, { animated: true })
            .resize(isCrop)
            .webp({
                loop: 0,
                force: true,
                quality: 80
            })
            .toFile(fim, (err, info) => {
                if (err) {
                    console.error(err);
                    return reject(err)
                }
                return resolve(fim)
            });
    })
}
async function webp2gif(file, name) {
    var fim = name + '.gif'
    return new Promise(async (resolve, reject) => {
        sharp(file, { animated: true })
            .removeAlpha()
            .toFile(fim, async (err, info) => {
                if (err) {
                    console.error(err);
                    return reject(err)
                }
                var fileFim = await toMp4(fim)
                resolve(fileFim)
            });
    })

}
async function toMp4(file) {
    var fim = file.replace('.gif', '.mp4')
    return new Promise(async (resolve, reject) => {
        ffmpeg(file)
            .addOutputOption([
                '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
            ])
            .toFormat('mp4')
            .save(fim)
            .on('end', () => {
                delFile(file)
                resolve(fim)
            })
            .on('error', (err) => { reject(err) })
    })
}
async function stickerAnimated(file, crop) {

    return new Promise(async (resolve, reject) => {

        let bufferStream = new PassThrough();
        let buffers = [];

        bufferStream.on('data', function (buf) {
            buffers.push(buf);
        });
        bufferStream.on('end', async function () {
            let outputBuffer = Buffer.concat(buffers);
            var fim = await toWebpAnimated(outputBuffer, crop)
            resolve(fim)
        });

        await toGifFromStream(file, bufferStream)
    })

}
async function toGifFromStream(file, outStream) {
    return new Promise(async (resolve, reject) => {
        ffmpeg(file)
            .addOutputOption([
                '-ss', '00', '-t', '10', '-vf',
                'fps=10,scale=400:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
                '-loop', '0'
            ])
            .toFormat('gif')
            .on('end', () => { resolve() })
            .on('error', (err) => {
                console.log(err)
                reject(null)
            })
            .writeToStream(outStream)
    })
}
async function toWebpAnimated(file, crop) {

    var isCrop = crop ? {
        width: 400,
        height: 400,
        fit: sharp.fit.cover
    } : {
        fit: sharp.fit.contain,
        width: 400,
        height: 400,
        background: { r: 0, b: 0, g: 0, alpha: 0 }
    }

    return new Promise(async (resolve, reject) => {
        try {
            sharp(file, { animated: true })
                .resize(isCrop)
                .webp({
                    loop: 0,
                    force: true,
                    quality: 80
                })
                .toBuffer((err, data, info) => {
                    if (err) {
                        console.error(err);
                        return reject(err)
                    }
                    return resolve(data)
                });
        } catch (error) {
            reject(error)
        }

    })
}