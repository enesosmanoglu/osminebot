const mineflayer = require('mineflayer')
const mineflayerViewer = require('prismarine-viewer').mineflayer
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalBlock, GoalNear, GoalFollow } = require('mineflayer-pathfinder').goals;

const bot = mineflayer.createBot({
    host: 'huzunlumumya.mcpro.io', // optional
    port: 25565,       // optional
    username: 'osmanbot', // email and password are required only for
    //password: '12345678',          // online-mode=true servers
    version: false,                 // false corresponds to auto version detection (that's the default), put for example "1.8.8" if you need a specific version
    auth: 'mojang'      // optional; by default uses mojang, if using a microsoft account, set to 'microsoft'
})

bot.loadPlugin(pathfinder);

mineflayerViewer(bot, { port: process.env.PORT || 80, firstPerson: false })

bot.on('login', () => {
    //bot.chat('sa')
})

bot.once('spawn', () => {

    bot.mcData = require('minecraft-data')(bot.version);
    bot.defaultMove = new Movements(bot, bot.mcData);

    bot.bedTypes = [
        'white_bed',
        'orange_bed',
        'magenta_bed',
        'light_blue_bed',
        'yellow_bed',
        'lime_bed',
        'pink_bed',
        'gray_bed',
        'light_gray_bed',
        'cyan_bed',
        'purple_bed',
        'blue_bed',
        'brown_bed',
        'green_bed',
        'red_bed',
        'black_bed',
    ];
})

let autoFishing = false;
bot.on('chat', function (username, message) {
    console.log(`<${username}> ${message}`)
    if (username === bot.username) return

    if (message == "!fish") {
        autoFishing = !autoFishing;

        if (autoFishing) {
            bot.chat('Oto balık tutma açıldı.')
            doFishing()
        } else
            bot.chat('Oto balık tutma kapatıldı.')
    }

})

function doFishing() {
    bot.fish((err) => {
        if (err)
            return console.error(err)

        if (autoFishing)
            setTimeout(doFishing, 100);

    })
}

async function storeCatches() {
    const listOfTransferrableItems = [];
    for (const item of bot.inventory.items()) {
        if (item.type !== 684) {
            listOfTransferrableItems.push(item);
        }
    }

    if (listOfTransferrableItems.length <= 0) {
        bot.chat("Koyabilecek item yok!");
        return;
    }

    const chestToOpen = bot.findBlock({
        matching: mcData.blocksByName['chest'].id,
        maxDistance: 32,
    });

    if (!chestToOpen) {
        bot.chat('Yakında sandık yok!');
        return;
    }

    const chest = await bot.openChest(chestToOpen);

    let totalItemsStored = 0;

    for (let item of listOfTransferrableItems) {
        if (item.type !== 684) {
            try {
                totalItemsStored += item.count;
                await chest.deposit(item.type, null, item.count);
            } catch (error) {
                console.log(error.message);
            }
        }
    }

    fisherman.chat(`${totalItemsStored} adet item depolandı!`);

    await chest.close();
}

// Log errors and kick reasons:
bot.on('kicked', (reason, loggedIn) => console.log(reason, loggedIn))
bot.on('error', err => console.log(err))
bot.on('death', function () {
    bot.emit("respawn")
});
bot.on('path_update', (r) => {
    const nodesPerTick = ((r.visitedNodes * 50) / r.time).toFixed(2);
    console.log(`${r.path.length} moves. (${r.time.toFixed(2)} ms, (${nodesPerTick} n/t)). ${r.status}`);
});