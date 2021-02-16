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
                    await bot.sleep(bedBlock);
                    await stopFishing(true);
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

    const ignoreEntities = [
        "Raw Cod", "Raw Salmon", "Pufferfish", "Tropical Fish",
    ]
    const dropEntities = [
        "Lily Pad", "Rotten Flesh", "Tripwire Hook", "Bowl",
    ]
    const onCollectHandler = (player, entity) => {
        if (entity.kind === 'Drops' && player === bot.entity) {
            if (botState.isFishing === false) {
                const { itemId } = entity.metadata[entity.metadata.length - 1];
                if (dropEntities.some(e => e == mcData.items[itemId].displayName)) {
                    bot.toss(itemId)
                } else {
                    if (!ignoreEntities.some(e => e == mcData.items[itemId].displayName))
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
        if (botState.isFishing === false) {
            const { waterBlock, groundBlock } = await getFishingSpot();

            moveToGoal(groundBlock.position, 'near');

            const sf_afterReach = async () => {
                bot.removeListener('goal_reached', sf_afterReach);

                await bot.lookAt(waterBlock.position.offset(0, 2, 2), true);

                try {
                    await bot.equip(mcData.itemsByName.fishing_rod.id, 'hand');
                } catch (error) {
                    bot.chat("I don't have a fishing rod!");
                    return;
                }

                bot.on('playerCollect', onCollectHandler);

                try {
                    botState.shouldFish = true;
                    botState.isFishing = true;
                    await bot.fish();
                    botState.isFishing = false;
                } catch (error) {
                    console.log('Fishing cancelled because of ' + error);
                    botState.isFishing = false;
                    setTimeout(() => { startFishing() }, 5000);
                }
            };

            bot.on('goal_reached', sf_afterReach);
        }
    };
    setTimeout(() => { startFishing() }, 3000);

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
            if (item.type !== 684) {
                listOfTransferrableItems.push(item);
            }
        }

        if (listOfTransferrableItems.length <= 0) {
            bot.chat("I don't have anything to store!");
            return;
        }

        await stopFishing();

        const chestToOpen = bot.findBlock({
            matching: mcData.blocksByName['chest'].id,
            maxDistance: 32,
        });

        if (!chestToOpen) {
            bot.chat('No chests nearby!');
            return;
        }

        moveToGoal(chestToOpen.position, 'near', 4);

        const afterReach = async () => {
            bot.removeListener('goal_reached', afterReach);

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

            bot.chat(`Stored ${totalItemsStored} item(s)!`);

            await chest.close();

            if (botState.shouldFish) {
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