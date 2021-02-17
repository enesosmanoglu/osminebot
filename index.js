/**
 * Mineflayer declarations
 */
const mineflayer = require('mineflayer');
const mineflayerViewer = require('prismarine-viewer').mineflayer;
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalBlock, GoalNear, GoalFollow } = require('mineflayer-pathfinder').goals;

/**
 * Utility declarations
 */
const getArguments = require('./utils/getArgs');
const config = require('./config.json');

const prefix = config.prefix || '!';

const bot = mineflayer.createBot({
    host: config.host,
    port: config.port || 25565,
    username: config.username || "osmanbot",
    password: config.password || "",
});

const botState = {
    isFishing: false,
    isStoring: false,
    isMoving: false,
    shouldFish: false,
};

bot.loadPlugin(pathfinder);


bot.once('spawn', () => {
    mineflayerViewer(bot, { port: process.env.PORT || 80 });
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);

    /**
     * LOOPS START
     */
    const bedTypes = [
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
    const shouldSleepLoop = async () => {
        if (!bot.time.isDay && !bot.isSleeping) {
            bot.chat("I'll sleep for you :)")
            const bedBlocks = bot.findBlocks({
                matching: bedTypes.map((bedName) => mcData.blocksByName[bedName].id),
                count: 10,
            });

            let i = 0;
            let bedBlock = null;

            const goToBed = () => {
                if (i > bedBlocks.length - 1) {
                    bot.chat("I can't find a suitable bed!");
                    return;
                }

                bedBlock = bot.blockAt(bedBlocks[i]);
                moveToGoal(bedBlock.position, 'near');
                bot.on('goal_reached', handleGoToBed);
            };

            const handleGoToBed = async () => {
                try {
                    await stopFishing(true);
                    await bot.sleep(bedBlock);
                    bot.on('wake', afterAwakeHandler);
                } catch (error) {
                    console.log(error.message);
                    i++;
                    goToBed();
                }

                bot.removeListener('goal_reached', handleGoToBed);
            };

            goToBed();
        }
    };

    if (config.auto_sleep)
        setInterval(() => {
            shouldSleepLoop();
        }, 5000);

    /**
     * LOOPS END
     */

    /**
     * LISTENER HANDLERS START
     */

    const afterAwakeHandler = () => {
        if (botState.shouldFish) {
            startFishing();
        }
        bot.removeListener('wake', afterAwakeHandler);
    };

    const reachedHandler = () => {
        bot.chat("I'm here!");
        bot.removeListener('goal_reached', reachedHandler);
    };


    const onCollectHandler = (player, entity) => {
        if (entity.kind === 'Drops' && player === bot.entity) {
            if (botState.isFishing === false) {
                const { itemId } = entity.metadata[entity.metadata.length - 1];
                console.log(`I caught a ${mcData.items[itemId].displayName}!`);
                if (config.dropEntities.some(e => e == mcData.items[itemId].displayName)) {
                    bot.tossStack(mcData.items[itemId], err => {
                        if (err)
                            console.log('Error while dropping entities:', err)
                        else
                            console.log('Dropped entity successfully!')
                    })
                } else {
                    if (!config.ignoreEntities.some(e => e == mcData.items[itemId].displayName))
                        bot.chat(`I caught a ${mcData.items[itemId].displayName}!`);
                }
                bot.removeListener('playerCollect', onCollectHandler);
                startFishing();
            }
        }
    };

    const reachedWaterHandler = () => {
        bot.chat('Reached my spot!');
        bot.removeListener('goal_reached', reachedWaterHandler);
    };

    /**
     * LISTENER HANDLERS END
     */

    /**
     * HELPER COMMANDS START
     */
    const getPlayerEntity = (playerName) => {
        return bot.players[playerName] ? bot.players[playerName].entity : null;
    };

    const moveToGoal = async (target, type = 'block', radius = 1) => {
        // console.log(target);

        if (bot.isSleeping) {
            await bot.wake();
        }

        bot.pathfinder.setMovements(defaultMove);

        let goal = null;

        if (type === 'block') {
            goal = new GoalBlock(target.x, target.y, target.z);
        } else if (type === 'near') {
            goal = new GoalNear(target.x, target.y, target.z, radius);
        } else {
            goal = null;
        }

        bot.pathfinder.setGoal(goal);
    };
    /**
     * HELPER COMMANDS END
     */

    /**
     * ASYNC COMMANDS START
     */

    const startFishing = async () => {
        console.log('startFishing: isFishing?', botState.isFishing)
        if (botState.isFishing === false) {
            const { waterBlock, groundBlock } = await getFishingSpot();

            moveToGoal(groundBlock.position, 'near');

            const sf_afterReach = async () => {
                bot.removeListener('goal_reached', sf_afterReach);
                logInventory()

                if (bot.inventory.items().length == 36) {
                    console.log('INVENTORY IS FULL - STORING ITEMS')
                    botState.shouldFish = true;
                    botState.isFishing = false;
                    storeCatches()
                    return
                }

                await bot.lookAt(waterBlock.position.offset(0, 2, 2), true);

                let fishing_rod
                if (config.fishing_rod_display_name) {
                    console.log('Searching special fishing rod named', config.fishing_rod_display_name)
                    fishing_rod = bot.inventory.items().find(i => {
                        let itemData = JSON.parse(JSON.stringify(i))
                        try {
                            return (JSON.parse(itemData.nbt.value.display.value.Name.value).text == config.fishing_rod_display_name) && i.type == mcData.itemsByName.fishing_rod.id
                        } catch (error) {
                            return false
                        }
                    })
                    if (!fishing_rod) {
                        console.log("Couldn't found!")
                        console.log("Searching any fishing rod.")
                        try {
                            await bot.equip(mcData.itemsByName.fishing_rod.id, 'hand');
                            console.log('Found!')
                        } catch (error) {
                            console.log("Couldn't found any fishing rod!")
                            bot.chat("I don't have a fishing rod!");
                            return;
                        }
                    } else {
                        console.log('Found!')
                        await bot.equip(fishing_rod, 'hand');
                    }
                } else {
                    console.log("Searching any fishing rod.")
                    try {
                        await bot.equip(mcData.itemsByName.fishing_rod.id, 'hand');
                        console.log('Found!')
                    } catch (error) {
                        console.log("Couldn't found any fishing rod!")
                        bot.chat("I don't have a fishing rod!");
                        return;
                    }
                }

                bot.on('playerCollect', onCollectHandler);

                try {
                    botState.shouldFish = true;
                    botState.isFishing = true;
                    await bot.fish();
                    botState.isFishing = false;
                } catch (error) {
                    console.log(error.message);
                    botState.isFishing = false;
                    bot.chat('Fishing cancelled')
                }
            };

            bot.on('goal_reached', sf_afterReach);
        }
    };

    if (config.auto_start_fishing_on_login)
        setTimeout(() => { startFishing() }, 1000);

    const stopFishing = async (shouldContinue = false) => {
        if (botState.isFishing === true) {
            bot.removeListener('playerCollect', onCollectHandler);
            bot.activateItem();
            botState.shouldFish = shouldContinue;
            botState.isFishing = false;
            bot.chat('Stopped fishing!');
        }
    };

    const storeCatches = async () => {
        const listOfTransferrableItems = [];
        for (const item of bot.inventory.items()) {
            listOfTransferrableItems.push(item);
            continue
            if (item.type !== 684) {
                listOfTransferrableItems.push(item);
            } else if (config.fishing_rod_display_name) {
                try {
                    let itemData = JSON.parse(JSON.stringify(item))
                    console.log(JSON.parse(itemData.nbt.value.display.value.Name.value).text)
                    if (JSON.parse(itemData.nbt.value.display.value.Name.value).text != config.fishing_rod_display_name)
                        listOfTransferrableItems.push(item);
                } catch (error) {
                    listOfTransferrableItems.push(item);
                }
            }
        }
        console.log(JSON.stringify(listOfTransferrableItems))

        if (listOfTransferrableItems.length <= 0) {
            bot.chat("I don't have anything to store!");
            if (!botState.isFishing && botState.shouldFish) {
                console.log('Fishing again!')
                startFishing();
            }
            return;
        }

        await stopFishing(true);

        const chestToOpen = bot.findBlock({
            matching: mcData.blocksByName['chest'].id,
            useExtraInfo: (block) => {
                try {
                    console.log(" ")
                    console.log("--------------------------------")
                    console.log(JSON.stringify(block))
                    console.log("--------------------------------")
                    console.log(" ")
                    bot.chat(block.items().length)
                    return block.items().length != 54
                } catch (error) {
                    return true
                }
            },
            maxDistance: 32,
        });

        if (!chestToOpen) {
            bot.chat('No chests nearby!');
            if (botState.shouldFish) {
                startFishing();
            }
            return;
        }

        moveToGoal(chestToOpen.position, 'near', 4);

        const afterReach = async () => {
            bot.removeListener('goal_reached', afterReach);

            const chest = await bot.openChest(chestToOpen);
            let totalItemsStored = 0;

            for (let item of listOfTransferrableItems) {
                try {
                    await chest.deposit(item.type, item.metadata, item.count);
                    totalItemsStored += item.count;
                } catch (error) {
                    console.log(error.message);
                    if (error.message == "destination full") {
                        bot.chat('I fulled a chest XD')
                        break
                    }
                }
            }
            await chest.withdraw(684, null, 1)
            await chest.close();
            bot.chat(`Stored ${totalItemsStored} item(s)!`);
            console.log("Stored", totalItemsStored, "/", listOfTransferrableItems.length)

            /* 
            if (totalItemsStored != listOfTransferrableItems.length) {
                storeCatches()
                return
            } */

            if (botState.shouldFish) {
                console.log('Fishing again!')
                startFishing();
            }
        };

        bot.on('goal_reached', afterReach);
    };

    const goNearWater = async () => {
        const { groundBlock } = await getFishingSpot();

        moveToGoal(groundBlock.position.offset(0.5, 1, 0.5), 'near');

        bot.once('goal_reached', reachedWaterHandler);
    };

    const getFishingSpot = async () => {
        const waterBlock = bot.findBlock({
            matching: ['water'].map((name) => mcData.blocksByName[name].id),
            useExtraInfo: (block) => bot.blockAt(block.position.offset(0, 1, 0)).type === mcData.blocksByName['air'].id && bot.blockAt(block.position.offset(0, 0, -1)).type === mcData.blocksByName['cobblestone'].id,
            maxDistance: 32,
        });

        if (!waterBlock) {
            bot.chat('No water found nearby!');
            return;
        }

        const groundBlock = bot.findBlock({
            matching: (block) => {
                return block.type !== mcData.blocksByName['water'].id;
            },
            useExtraInfo: (block) =>
                block.position.distanceTo(waterBlock.position) <= 1 &&
                bot.blockAt(block.position.offset(0, 1, 0)).type === mcData.blocksByName['air'].id,
            maxDistance: 32,
        });

        if (!groundBlock) {
            bot.chat('No place to stand!');
            return;
        }

        return { waterBlock, groundBlock };
    };

    /**
     * ASYNC COMMANDS END
     */

    bot.on('chat', function (username, message) {
        console.log(`<${username}> ${message}`)
        if (!message.startsWith(prefix) || username === bot.username) return;

        let command;
        try {
            command = getArguments(message, username, prefix);
        } catch (error) {
            console.log(error);
            return;
        }

        const keyword = command.keyword;
        const args = command.info.args;
        const commander = command.info.commander;

        switch (keyword) {
            case 'start':
                startFishing();
                break;
            case 'stop':
                stopFishing();
                break;
            case 'nearwater':
                goNearWater();
                break;
            case 'goto':
                if (args.length === 1) {
                    let targetUsername = args[0].replace(/"/g, '');

                    if (targetUsername === bot.username) return;

                    if (args[0] === 'me') {
                        targetUsername = commander;
                    }

                    const target = getPlayerEntity(targetUsername);

                    if (!target) {
                        bot.chat(`Can't find anyone with the name ${targetUsername}`);
                        return;
                    }

                    const { x, y, z } = target.position;

                    stopFishing();

                    bot.chat(`Im going to ${target.username}!`);

                    moveToGoal({ x, y, z }, 'near');
                } else if (args.length === 3) {
                    const [x, y, z] = args;

                    stopFishing();

                    bot.chat(`Im going to ${x}, ${y}, ${z}!`);

                    moveToGoal({ x, y, z }, 'near');
                } else {
                    bot.chat("I don't understand!");
                }

                bot.on('goal_reached', reachedHandler);
                break;
            case 'store':
                storeCatches();
                break;
            default:
                break;
        }
    });

    bot.on('path_update', (r) => {
        const nodesPerTick = ((r.visitedNodes * 50) / r.time).toFixed(2);

        console.log(`${r.path.length} moves. (${r.time.toFixed(2)} ms, (${nodesPerTick} n/t)). ${r.status}`);
    });
});


function logInventory() {
    let data = []
    bot.inventory.items().forEach(item => {
        let name
        try {
            name = JSON.parse(itemData.nbt.value.display.value.Name.value).text
        } catch (error) {
            name = item.displayName
        }
        for (let i = 0; i < item.count; i++) {
            data.push(name)
        }
    })

    var counts = {};
    data.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });

    console.log('===========================')
    console.log('         INVENTORY         ')
    console.log('       SLOTS:', bot.inventory.items().length, "/ 36      ")
    console.log('===========================')
    console.log('           ITEMS           ')
    for (let i = 0; i < Object.entries(counts).length; i++) {
        const item = Object.entries(counts)[i];
        console.log("  •", item[1], "x", item[0])
    }
    console.log('===========================')
}