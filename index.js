const SteamUser = require('steam-user')
const inquirer = require('inquirer')
const fs = require('fs')
const path = require('path')
const SteamTotp = require('steam-totp')
const sleep = require('sleep-promise')
const _ = require('lodash')

let EXITING = false

const client = new SteamUser

const getMaFiles = async (config = {}) => {
    let maFiles
    while (true) {
        let { pathToMaFiles } = await inquirer.prompt({
            type: 'input',
            name: 'pathToMaFiles',
            message: "Enter path to MaFiles directory",
            default: path.join(__dirname, 'MaFiles')
        })
        // console.log(pathToMaFiles)
        try {
            return fs.readdirSync(pathToMaFiles)
                .filter(x => path.extname(x) == '.maFile')
                .map(x => ({ name: x, content: JSON.parse(fs.readFileSync(path.join(pathToMaFiles, x))) }))
        } catch (err) {
            console.error(`Can't read MaFiles directory!`, err.toString())
        }
    }
}

const getMaFile = async (config = {}) => {
    if (config.maFile) return config.maFile
    let maFiles = await getMaFiles(config)
    let { maFile } = await inquirer.prompt({
        type: 'list',
        name: 'maFile',
        message: "Select MaFile",
        choices: maFiles
        // default: path.join(__dirname, 'MaFiles')
    })
    config.maFile = maFiles.find(x => x.name == maFile).content
    return config.maFile
}

const getPassword = async (config = {}) => {
    if (config.passwordEncoded) return Buffer.from(config.passwordEncoded, 'base64').toString()
    let maFile = await getMaFile(config)
    let { password } = await inquirer.prompt({
        type: 'password',
        name: 'password',
        message: `Enter password for ${maFile.account_name}`,
    })
    config.passwordEncoded = Buffer.from(password).toString('base64')
    return password
}

const getCredentials = async (config = {}) => {
    let maFile = await getMaFile(config)
    let password = await getPassword(config)
    return {
        accountName: maFile.account_name,
        password,
        twoFactorCode: SteamTotp.generateAuthCode(maFile.shared_secret)
    }
}

const loadConfig = () => {
    let config = {}
    try {
        config = require('./config.json')
    } catch (err) {}
    return config
}

const saveConfig = (config) => {
    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, undefined, 2))
    // console.log('Config saved!')
}

const getGames = () => new Promise((resolve, reject) => {
    client.getUserOwnedApps(client.steamID, (err, response) => {
        if (err) return reject(err)
        resolve(response.apps)
    })
})

const requestFreeLicense = (appids = [730]) => new Promise((resolve, reject) => {
    client.requestFreeLicense(appids, (err, grantedPackageIds, grantedAppIds) => {
        resolve([grantedPackageIds, grantedAppIds])
    })
})

const selectGames = async (config = {}) => {
    if (config.selectedGames) return config.selectedGames
    let { requestCsgoLicense } =  await inquirer.prompt({
        type: 'confirm',
        name: 'requestCsgoLicense',
        messaage: 'Request CSGO license',
        default: false
    })
    if (requestCsgoLicense) {
        await requestFreeLicense([730])
    }
    let allGames = await getGames()
    let { selectedGames } = await inquirer.prompt({
        type: 'checkbox',
        name: 'selectedGames',
        choices: allGames,
        message: 'Select which games to play'
    })
    config.selectedGames = allGames.filter(x => selectedGames.includes(x.name))
    return config.selectedGames
}

const main = async () => {
    let config = loadConfig()
    let credentials = await getCredentials(config)
    client.logOn(credentials)
    client.on('loggedOn', async () => {
        console.log('Logged on!')
        saveConfig(config)
        let games = await selectGames(config)
        saveConfig(config)
        while (true) {
            if (EXITING) break
            let game = _.sample(games)
            let playTime = Math.floor(Math.random() * 60 * 60 * 1000 * 12)
            let waitTime = Math.floor(Math.random() * 60 * 60 * 1000 * 24)
            client.gamesPlayed([game.appid])
            console.log(`Playing ${game.name} for ${playTime / 1000} seconds`)
            await sleep(playTime)
            client.gamesPlayed([])
            console.log(`Waiting for ${waitTime / 1000} seconds`)
            await sleep(waitTime)
        }
        // console.log(games)
    })

}

main().then(() => {}, (err) =>  {
    console.error('Unhandled rejection!', err)
})


process.on('SIGINT', async function() {
    try {
        console.log('\nExiting from all games...')
        client.gamesPlayed([])
        await sleep(500)
    } catch (err) {
        console.log(err)
    }
    process.exit(0)
})
