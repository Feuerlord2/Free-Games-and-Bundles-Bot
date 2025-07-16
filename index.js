const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

// Bot Setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const parser = new Parser();

// RSS Feed Konfiguration - Verwendet Environment Variables für individuelle Konfiguration
const RSS_FEEDS = [
    {
        name: "Humble Games",
        url: "https://feuerlord2.github.io/Humble-RSS-Site/games.rss",
        channelId: process.env.HUMBLE_GAMES_CHANNEL_ID,
        roleId: process.env.HUMBLE_GAMES_ROLE_ID || null,
        enabled: true
    },
    {
        name: "Humble Books",
        url: "https://feuerlord2.github.io/Humble-RSS-Site/books.rss",
        channelId: process.env.HUMBLE_BOOKS_CHANNEL_ID,
        roleId: process.env.HUMBLE_BOOKS_ROLE_ID || null,
        enabled: true
    },
    {
        name: "Humble Software",
        url: "https://feuerlord2.github.io/Humble-RSS-Site/software.rss",
        channelId: process.env.HUMBLE_SOFTWARE_CHANNEL_ID,
        roleId: process.env.HUMBLE_SOFTWARE_ROLE_ID || null,
        enabled: true
    },
    {
        name: "Fanatical Games",
        url: "https://feuerlord2.github.io/Fanatical-RSS-Site/games.rss",
        channelId: process.env.FANATICAL_GAMES_CHANNEL_ID,
        roleId: process.env.FANATICAL_GAMES_ROLE_ID || null,
        enabled: true
    },
    {
        name: "Fanatical Books",
        url: "https://feuerlord2.github.io/Fanatical-RSS-Site/books.rss",
        channelId: process.env.FANATICAL_BOOKS_CHANNEL_ID,
        roleId: process.env.FANATICAL_BOOKS_ROLE_ID || null,
        enabled: true
    },
    {
        name: "Fanatical Software",
        url: "https://feuerlord2.github.io/Fanatical-RSS-Site/software.rss",
        channelId: process.env.FANATICAL_SOFTWARE_CHANNEL_ID,
        roleId: process.env.FANATICAL_SOFTWARE_ROLE_ID || null,
        enabled: true
    }
];

// Datei für bereits gesendete Artikel
const SENT_ARTICLES_FILE = path.join(__dirname, 'sent_articles.json');

// Bereits gesendete Artikel laden
function loadSentArticles() {
    try {
        if (fs.existsSync(SENT_ARTICLES_FILE)) {
            const data = fs.readFileSync(SENT_ARTICLES_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Fehler beim Laden der sent_articles.json:', error);
    }
    return {};
}

// Bereits gesendete Artikel speichern
function saveSentArticles(sentArticles) {
    try {
        fs.writeFileSync(SENT_ARTICLES_FILE, JSON.stringify(sentArticles, null, 2));
    } catch (error) {
        console.error('Fehler beim Speichern der sent_articles.json:', error);
    }
}

// Artikel-ID generieren (basierend auf URL oder GUID)
function generateArticleId(item) {
    return item.guid || item.link || item.title;
}

// RSS Feed parsen und neue Artikel senden
async function checkFeed(feedConfig) {
    if (!feedConfig.enabled || !feedConfig.channelId || feedConfig.channelId === 'undefined' || feedConfig.channelId === null) {
        console.log(`⏭️  Überspringe Feed ${feedConfig.name} (Channel ID: ${feedConfig.channelId})`);
        return;
    }

    try {
        console.log(`Überprüfe Feed: ${feedConfig.name}`);
        const feed = await parser.parseURL(feedConfig.url);
        const sentArticles = loadSentArticles();
        
        if (!sentArticles[feedConfig.name]) {
            sentArticles[feedConfig.name] = [];
        }

        // Neue Artikel finden (neueste zuerst)
        const newArticles = feed.items.filter(item => {
            const articleId = generateArticleId(item);
            return !sentArticles[feedConfig.name].includes(articleId);
        }).slice(0, 3); // Maximal 3 neue Artikel pro Check

        for (const item of newArticles) {
            await sendArticle(item, feedConfig);
            
            // Artikel als gesendet markieren
            const articleId = generateArticleId(item);
            sentArticles[feedConfig.name].push(articleId);
            
            // Nur die letzten 100 Artikel pro Feed speichern
            if (sentArticles[feedConfig.name].length > 100) {
                sentArticles[feedConfig.name] = sentArticles[feedConfig.name].slice(-100);
            }
        }

        if (newArticles.length > 0) {
            saveSentArticles(sentArticles);
            console.log(`${newArticles.length} neue Artikel von ${feedConfig.name} gesendet`);
        }

    } catch (error) {
        console.error(`Fehler beim Überprüfen des Feeds ${feedConfig.name}:`, error);
    }
}

// Artikel an Discord senden
async function sendArticle(item, feedConfig) {
    try {
        const channel = await client.channels.fetch(feedConfig.channelId);
        if (!channel) {
            console.error(`Channel ${feedConfig.channelId} nicht gefunden`);
            return;
        }

        // Embed erstellen
        const embed = new EmbedBuilder()
            .setTitle(item.title || 'Kein Titel')
            .setURL(item.link || null)
            .setDescription(truncateText(item.contentSnippet || item.content || 'Keine Beschreibung verfügbar', 2000))
            .setColor(0x0099FF)
            .setTimestamp(new Date(item.pubDate || Date.now()))
            .setFooter({ text: feedConfig.name });

        // Autor hinzufügen falls vorhanden
        if (item.creator || item.author) {
            embed.setAuthor({ name: item.creator || item.author });
        }

        // Thumbnail hinzufügen falls vorhanden
        if (item.enclosure && item.enclosure.url) {
            embed.setThumbnail(item.enclosure.url);
        }

        // Nachricht erstellen
        let messageContent = '';
        if (feedConfig.roleId) {
            messageContent = `<@&${feedConfig.roleId}>`;
        }

        await channel.send({
            content: messageContent,
            embeds: [embed]
        });

    } catch (error) {
        console.error(`Fehler beim Senden des Artikels:`, error);
    }
}

// Text kürzen
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

// Bot Events
client.once('ready', () => {
    console.log(`Bot ist online als ${client.user.tag}`);
    
    // Debug: Environment Variables anzeigen
    console.log('🔍 Environment Variables Check:');
    console.log(`HUMBLE_GAMES_CHANNEL_ID: ${process.env.HUMBLE_GAMES_CHANNEL_ID || 'NICHT GESETZT'}`);
    console.log(`HUMBLE_BOOKS_CHANNEL_ID: ${process.env.HUMBLE_BOOKS_CHANNEL_ID || 'NICHT GESETZT'}`);
    console.log(`HUMBLE_SOFTWARE_CHANNEL_ID: ${process.env.HUMBLE_SOFTWARE_CHANNEL_ID || 'NICHT GESETZT'}`);
    
    // Validierung der Feed-Konfiguration
    const validFeeds = RSS_FEEDS.filter(feed => feed.channelId && feed.channelId !== 'undefined' && feed.channelId !== null);
    const invalidFeeds = RSS_FEEDS.filter(feed => !feed.channelId || feed.channelId === 'undefined' || feed.channelId === null);
    
    if (invalidFeeds.length > 0) {
        console.warn('⚠️  Folgende Feeds haben keine gültige Channel ID und werden übersprungen:');
        invalidFeeds.forEach(feed => console.warn(`   - ${feed.name} (Channel ID: ${feed.channelId})`));
    }
    
    console.log(`✅ Überwacht ${validFeeds.length} RSS Feeds`);
    validFeeds.forEach(feed => {
        const roleInfo = feed.roleId ? `mit Rolle ${feed.roleId}` : 'ohne Rolle-Ping';
        console.log(`   - ${feed.name} → Channel ${feed.channelId} (${roleInfo})`);
    });
    
    // Erste Überprüfung nach 10 Sekunden
    setTimeout(() => {
        checkAllFeeds();
    }, 10000);
    
    // Dann alle 45 Minuten (2700000 ms)
    setInterval(checkAllFeeds, 2700000);
});

// Alle Feeds überprüfen
async function checkAllFeeds() {
    console.log('Überprüfe alle RSS Feeds...');
    for (const feedConfig of RSS_FEEDS) {
        await checkFeed(feedConfig);
        // Kurze Pause zwischen den Feeds
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

// Einfache Befehle für Verwaltung
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // Nur Administratoren können Bot-Befehle verwenden
    if (!message.member.permissions.has('ADMINISTRATOR')) return;
    
    if (message.content === '!rss-status') {
        const enabledFeeds = RSS_FEEDS.filter(f => f.enabled);
        const disabledFeeds = RSS_FEEDS.filter(f => !f.enabled);
        
        const embed = new EmbedBuilder()
            .setTitle('RSS Bot Status')
            .setColor(0x00FF00)
            .addFields(
                { name: 'Aktive Feeds', value: enabledFeeds.map(f => f.name).join('\n') || 'Keine', inline: true },
                { name: 'Deaktivierte Feeds', value: disabledFeeds.map(f => f.name).join('\n') || 'Keine', inline: true }
            )
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
    }
    
    if (message.content === '!rss-check') {
        await message.reply('Überprüfe alle RSS Feeds manuell...');
        await checkAllFeeds();
        await message.followUp('✅ RSS Feed Überprüfung abgeschlossen!');
    }
});

// Error Handling
client.on('error', error => {
    console.error('Discord Client Error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught Exception:', error);
});

// Bot starten
client.login(process.env.DISCORD_TOKEN);
