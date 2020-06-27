const {defaultSettings} = require('../util/default.json');
const Lang = require('../util/i18n.js');
const allLangs = Lang.allLangs();
var db = require('../util/database.js');

var allSites = [];
const getAllSites = require('../util/allSites.js');
getAllSites.then( sites => allSites = sites );

function cmd_settings(lang, msg, args, line, wiki) {
	if ( !allSites.length ) getAllSites.get().then( sites => allSites = sites );
	if ( !msg.isAdmin() ) return msg.reactEmoji('❌');
	
	db.all( 'SELECT channel, lang, wiki, prefix, inline FROM discord WHERE guild = ? ORDER BY channel DESC', [msg.guild.id], (error, rows) => {
		if ( error ) {
			console.log( '- Error while getting the settings: ' + error );
			msg.reactEmoji('error', true);
			return error;
		}
		var guild = rows.find( row => !row.channel );
		if ( !guild ) guild = Object.assign({prefix: process.env.prefix}, defaultSettings);
		var prefix = guild.prefix;
		var text = lang.get('settings.missing').replaceSave( '%1$s', '`' + prefix + 'settings lang`' ).replaceSave( '%2$s', '`' + prefix + 'settings wiki`' );
		if ( rows.length ) {
			text = lang.get('settings.current') + '\n' + lang.get('settings.currentlang') + ' `' + allLangs.names[guild.lang][1] + '` - `' + prefix + 'settings lang`';
			if ( msg.guild.id in patreons ) text += '\n' + lang.get('settings.currentprefix') + ' `' + prefix + '` - `' + prefix + 'settings prefix`';
			text += '\n' + lang.get('settings.currentinline') + ' ' + ( guild.inline ? '~~' : '' ) + '`[[' + lang.get('search.page') + ']]`' + ( guild.inline ? '~~' : '' ) + ' - `' + prefix + 'settings inline`';
			text += '\n' + lang.get('settings.currentwiki') + ' ' + guild.wiki + ' - `' + prefix + 'settings wiki`';
			text += '\n' + lang.get('settings.currentchannel') + ' `' + prefix + 'settings channel`\n';
			if ( rows.length === 1 ) text += lang.get('settings.nochannels');
			else text += rows.filter( row => row !== guild ).map( row => '<#' + row.channel + '>: ' + ( msg.guild.id in patreons ? '`' + allLangs.names[row.lang][1] + '` - ' : '' ) + '<' + row.wiki + '>' + ( msg.guild.id in patreons ? ' - ' + ( row.inline ? '~~' : '' ) + '`[[' + lang.get('search.page') + ']]`' + ( row.inline ? '~~' : '' ) : '' ) ).join('\n');
		}
		
		if ( !args.length ) {
			return msg.replyMsg( text, {split:true}, true );
		}
		
		var prelang = '';
		args[0] = args[0].toLowerCase();
		if ( args[0] === 'channel' ) {
			prelang = 'channel ';
			if ( !rows.length ) return msg.replyMsg( text, {split:true}, true );
			
			var channel = rows.find( row => row.channel === msg.channel.id );
			if ( !channel ) channel = Object.assign({channel:msg.channel.id}, guild);
			text = lang.get('settings.' + prelang + 'current');
			if ( msg.guild.id in patreons ) {
				text += '\n' + lang.get('settings.currentlang') + ' `' + allLangs.names[channel.lang][1] + '` - `' + prefix + 'settings channel lang`';
				text += '\n' + lang.get('settings.currentinline') + ' ' + ( channel.inline ? '~~' : '' ) + '`[[' + lang.get('search.page') + ']]`' + ( channel.inline ? '~~' : '' ) + ' - `' + prefix + 'settings channel inline`';
			}
			text += '\n' + lang.get('settings.currentwiki') + ' ' + channel.wiki + ' - `' + prefix + 'settings channel wiki`';
			
			if ( !args[1] ) return msg.replyMsg( text, {}, true );
			
			args[0] = args[1].toLowerCase();
			args[1] = args.slice(2).join(' ').toLowerCase().trim().replace( /^<\s*(.*)>$/, '$1' );
		}
		else args[1] = args.slice(1).join(' ').toLowerCase().trim().replace( /^<\s*(.*)>$/, '$1' );
		
		if ( args[0] === 'wiki' ) {
			prelang += 'wiki';
			var wikihelp = '\n' + lang.get('settings.wikihelp').replaceSave( '%s', prefix + 'settings ' + prelang );
			if ( !args[1] ) {
				if ( !rows.length ) return msg.replyMsg( lang.get('settings.wikimissing') + wikihelp, {}, true );
				else return msg.replyMsg( lang.get('settings.' + prelang) + ' ' + ( channel || guild ).wiki + wikihelp, {}, true );
			}
			var regex = args[1].match( /^(?:https:\/\/)?([a-z\d-]{1,50}\.(?:gamepedia\.com|(?:fandom\.com|wikia\.org)(?:(?!\/wiki\/)\/[a-z-]{1,8})?))(?:\/|$)/ );
			if ( !regex ) {
				var value = args[1].split(' ');
				if ( value.length === 2 && value[1] === '--force' ) return msg.reactEmoji('⏳', true).then( reaction => {
					got.get( value[0] + 'api.php?action=query&meta=siteinfo&siprop=general|extensions&format=json', {
						responseType: 'json'
					} ).then( response => {
						var body = response.body;
						if ( response.statusCode !== 200 || !body || body.batchcomplete === undefined ) {
							console.log( '- ' + response.statusCode + ': Error while testing the wiki: ' + ( body && body.error && body.error.info ) );
							if ( reaction ) reaction.removeEmoji();
							msg.reactEmoji('nowiki', true);
							return msg.replyMsg( lang.get('settings.wikiinvalid') + wikihelp, {}, true );
						}
						var sql = 'UPDATE discord SET wiki = ? WHERE guild = ? AND wiki = ?';
						var sqlargs = [value[0], msg.guild.id, guild.wiki];
						if ( !rows.length ) {
							sql = 'INSERT INTO discord(wiki, guild) VALUES(?, ?)';
							sqlargs.pop();
						}
						if ( channel ) {
							sql = 'UPDATE discord SET wiki = ? WHERE guild = ? AND channel = ?';
							sqlargs[2] = msg.channel.id;
							if ( !rows.includes( channel ) ) {
								if ( channel.wiki === value[0] ) {
									if ( reaction ) reaction.removeEmoji();
									return msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' ' + channel.wiki + wikihelp, {}, true );
								}
								sql = 'INSERT INTO discord(wiki, guild, channel, lang, prefix) VALUES(?, ?, ?, ?, ?)';
								sqlargs.push(guild.lang, guild.prefix);
							}
						}
						return db.run( sql, sqlargs, function (dberror) {
							if ( dberror ) {
								console.log( '- Error while editing the settings: ' + dberror );
								msg.replyMsg( lang.get('settings.save_failed'), {}, true );
								if ( reaction ) reaction.removeEmoji();
								return dberror;
							}
							console.log( '- Settings successfully updated.' );
							if ( channel ) channel.wiki = value[0];
							else guild.wiki = value[0];
							if ( channel || !rows.some( row => row.channel === msg.channel.id ) ) wiki = value[0];
							if ( reaction ) reaction.removeEmoji();
							msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' ' + value[0] + wikihelp, {}, true );
							var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.inline === guild.inline ).map( row => row.channel );
							if ( channels.length ) db.run( 'DELETE FROM discord WHERE channel IN (' + channels.map( row => '?' ).join('|') + ')', channels, function (delerror) {
								if ( delerror ) {
									console.log( '- Error while removing the settings: ' + delerror );
									return delerror;
								}
								console.log( '- Settings successfully removed.' );
							} );
						} );
					}, ferror => {
						console.log( '- Error while testing the wiki: ' + ferror );
						if ( reaction ) reaction.removeEmoji();
						msg.reactEmoji('nowiki', true);
						return msg.replyMsg( lang.get('settings.wikiinvalid') + wikihelp, {}, true );
					} );
				} );
				if ( allSites.some( site => site.wiki_domain === value.join('') + '.gamepedia.com' ) ) {
					regex = ['https://' + value.join('') + '.gamepedia.com/',value.join('') + '.gamepedia.com'];
				}
				else if ( /^(?:[a-z-]{1,8}\.)?[a-z\d-]{1,50}$/.test(value.join('')) ) {
					if ( !value.join('').includes( '.' ) ) regex = ['https://' + value.join('') + '.fandom.com/',value.join('') + '.fandom.com'];
					else regex = ['https://' + value.join('').split('.')[1] + '.fandom.com/' + value.join('').split('.')[0] + '/',value.join('').split('.')[1] + '.fandom.com/' + value.join('').split('.')[0]];
				} else {
					var text = lang.get('settings.wikiinvalid') + wikihelp;
					var sites = allSites.filter( site => site.wiki_display_name.toLowerCase().includes( value.join(' ') ) );
					if ( 0 < sites.length && sites.length < 21 ) {
						text += '\n\n' + lang.get('settings.foundwikis') + '\n' + sites.map( site => site.wiki_display_name + ': `' + site.wiki_domain + '`' ).join('\n');
					}
					return msg.replyMsg( text, {split:true}, true );
				}
			}
			var sql = 'UPDATE discord SET wiki = ? WHERE guild = ? AND wiki = ?';
			var sqlargs = ['https://' + regex[1] + '/', msg.guild.id, guild.wiki];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(wiki, guild) VALUES(?, ?)';
				sqlargs.pop();
			}
			if ( channel ) {
				sql = 'UPDATE discord SET wiki = ? WHERE guild = ? AND channel = ?';
				sqlargs[2] = msg.channel.id;
				if ( !rows.includes( channel ) ) {
					if ( channel.wiki === 'https://' + regex[1] + '/' ) {
						return msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' ' + channel.wiki + wikihelp, {}, true );
					}
					sql = 'INSERT INTO discord(wiki, guild, channel, lang, prefix) VALUES(?, ?, ?, ?, ?)';
					sqlargs.push(guild.lang, guild.prefix);
				}
			}
			return db.run( sql, sqlargs, function (dberror) {
				if ( dberror ) {
					console.log( '- Error while editing the settings: ' + dberror );
					msg.replyMsg( lang.get('settings.save_failed'), {}, true );
					return dberror;
				}
				console.log( '- Settings successfully updated.' );
				if ( channel ) channel.wiki = 'https://' + regex[1] + '/';
				else guild.wiki = 'https://' + regex[1] + '/';
				if ( channel || !rows.some( row => row.channel === msg.channel.id ) ) wiki = 'https://' + regex[1] + '/';
				msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' https://' + regex[1] + '/' + wikihelp, {}, true );
				var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.inline === guild.inline ).map( row => row.channel );
				if ( channels.length ) db.run( 'DELETE FROM discord WHERE channel IN (' + channels.map( row => '?' ).join('|') + ')', channels, function (delerror) {
					if ( delerror ) {
						console.log( '- Error while removing the settings: ' + delerror );
						return delerror;
					}
					console.log( '- Settings successfully removed.' );
				} );
			} );
		}
		
		if ( args[0] === 'lang' ) {
			if ( channel && !( msg.guild.id in patreons ) ) return msg.replyMsg( lang.get('patreon') + ' <' + process.env.patreon + '>', {}, true );
			prelang += 'lang';
			var langhelp = '\n' + lang.get('settings.langhelp').replaceSave( '%s', prefix + 'settings ' + prelang ) + ' `' + Object.values(allLangs.names).map( val => val[0] ).join('`, `') + '`';
			if ( !args[1] ) {
				return msg.replyMsg( lang.get('settings.' + prelang) + ' `' + allLangs.names[( channel || guild ).lang][1] + '`' + langhelp, {}, true );
			}
			if ( !( args[1] in allLangs.map ) ) {
				return msg.replyMsg( lang.get('settings.langinvalid') + langhelp, {}, true );
			}
			var sql = 'UPDATE discord SET lang = ? WHERE guild = ? AND lang = ?';
			var sqlargs = [allLangs.map[args[1]], msg.guild.id, guild.lang];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(lang, guild) VALUES(?, ?)';
				sqlargs.pop();
			}
			if ( channel ) {
				sql = 'UPDATE discord SET lang = ? WHERE guild = ? AND channel = ?';
				sqlargs[2] = msg.channel.id;
				if ( !rows.includes( channel ) ) {
					if ( channel.lang === allLangs.map[args[1]] ) {
						return msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' `' + allLangs.names[channel.lang][1] + '`' + langhelp, {}, true );
					}
					sql = 'INSERT INTO discord(lang, guild, channel, wiki, prefix) VALUES(?, ?, ?, ?, ?)';
					sqlargs.push(guild.wiki, guild.prefix);
				}
			}
			return db.run( sql, sqlargs, function (dberror) {
				if ( dberror ) {
					console.log( '- Error while editing the settings: ' + dberror );
					msg.replyMsg( lang.get('settings.save_failed'), {}, true );
					return dberror;
				}
				console.log( '- Settings successfully updated.' );
				if ( channel ) channel.lang = allLangs.map[args[1]];
				else {
					guild.lang = allLangs.map[args[1]];
					if ( msg.guild.id in voice ) voice[msg.guild.id] = guild.lang;
				}
				if ( channel || !( msg.guild.id in patreons ) || !rows.some( row => row.channel === msg.channel.id ) ) lang = new Lang(allLangs.map[args[1]]);
				msg.replyMsg( lang.get('settings.' + prelang + 'changed') + ' `' + allLangs.names[allLangs.map[args[1]]][1] + '`\n' + lang.get('settings.langhelp').replaceSave( '%s', prefix + 'settings ' + prelang ) + ' `' + Object.values(allLangs.names).join('`, `') + '`', {}, true );
				var channels = rows.filter( row => row.channel && row.lang === lang.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.inline === guild.inline ).map( row => row.channel );
				if ( channels.length ) db.run( 'DELETE FROM discord WHERE channel IN (' + channels.map( row => '?' ).join('|') + ')', channels, function (delerror) {
					if ( delerror ) {
						console.log( '- Error while removing the settings: ' + delerror );
						return delerror;
					}
					console.log( '- Settings successfully removed.' );
				} );
			} );
		}
		
		if ( args[0] === 'prefix' && !channel ) {
			if ( !( msg.guild.id in patreons ) ) {
				return msg.replyMsg( lang.get('patreon') + ' <' + process.env.patreon + '>', {}, true );
			}
			var prefixhelp = '\n' + lang.get('settings.prefixhelp').replaceSave( '%s', prefix + 'settings prefix' );
			args[1] = args[1].replace( /(?<!\\)_$/, ' ' ).replace( /\\([_\W])/g, '$1' );
			if ( !args[1].trim() ) {
				return msg.replyMsg( lang.get('settings.prefix') + ' `' + prefix.replace( / $/, '_' ) + '`' + prefixhelp, {}, true );
			}
			if ( args[1].includes( '`' ) || args[1].length > 100 ) {
				return msg.replyMsg( lang.get('settings.prefixinvalid') + prefixhelp, {}, true );
			}
			if ( args[1] === 'reset' || args[1] === 'default' ) args[1] = process.env.prefix;
			var sql = 'UPDATE discord SET prefix = ? WHERE guild = ?';
			var sqlargs = [args[1], msg.guild.id];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(prefix, guild) VALUES(?, ?)';
			}
			return db.run( sql, sqlargs, function (dberror) {
				if ( dberror ) {
					console.log( '- Error while editing the settings: ' + dberror );
					msg.replyMsg( lang.get('settings.save_failed'), {}, true );
					return dberror;
				}
				console.log( '- Settings successfully updated.' );
				guild.prefix = args[1];
				msg.client.shard.broadcastEval( `global.patreons['${msg.guild.id}'] = '${args[1]}'` );
				msg.replyMsg( lang.get('settings.prefixchanged') + ' `' + args[1].replace( / $/, '_' ) + '`\n' + lang.get('settings.prefixhelp').replaceSave( '%s', args[1] + 'settings prefix' ), {}, true );
			} );
		}
		
		if ( args[0] === 'inline' ) {
			if ( channel && !( msg.guild.id in patreons ) ) return msg.replyMsg( lang.get('patreon') + ' <' + process.env.patreon + '>', {}, true );
			prelang += 'inline';
			var toggle = 'inline ' + ( ( channel || guild ).inline ? 'disabled' : 'enabled' );
			var inlinehelp = '\n' + lang.get('settings.' + toggle + '.help').replaceSave( '%1$s', prefix + 'settings ' + prelang + ' toggle' ).replaceSave( /%2\$s/g, lang.get('search.page') );
			if ( args[1] !== 'toggle' ) {
				return msg.replyMsg( lang.get('settings.' + toggle + '.' + prelang) + inlinehelp, {}, true );
			}
			var value = ( ( channel || guild ).inline ? null : 1 );
			var sql = 'UPDATE discord SET inline = ? WHERE guild = ?';
			var sqlargs = [value, msg.guild.id];
			if ( !rows.length ) {
				sql = 'INSERT INTO discord(inline, guild) VALUES(?, ?)';
			}
			if ( channel ) {
				sql = 'UPDATE discord SET inline = ? WHERE guild = ? AND channel = ?';
				sqlargs.push(msg.channel.id);
				if ( !rows.includes( channel ) ) {
					sql = 'INSERT INTO discord(inline, guild, channel, wiki, prefix) VALUES(?, ?, ?, ?, ?)';
					sqlargs.push(guild.wiki, guild.prefix);
				}
			}
			return db.run( sql, sqlargs, function (dberror) {
				if ( dberror ) {
					console.log( '- Error while editing the settings: ' + dberror );
					msg.replyMsg( lang.get('settings.save_failed'), {}, true );
					return dberror;
				}
				console.log( '- Settings successfully updated.' );
				if ( channel ) channel.inline = value;
				else guild.inline = value;
				toggle = 'inline ' + ( ( channel || guild ).inline ? 'disabled' : 'enabled' );
				msg.replyMsg( lang.get('settings.' + toggle + '.' + prelang + 'changed') + '\n' + lang.get('settings.' + toggle + '.help').replaceSave( '%1$s', prefix + 'settings ' + prelang + ' toggle' ).replaceSave( /%2\$s/g, lang.get('search.page') ), {}, true );
				var channels = rows.filter( row => row.channel && row.lang === guild.lang && row.wiki === guild.wiki && row.prefix === guild.prefix && row.inline === guild.inline ).map( row => row.channel );
				if ( channels.length ) db.run( 'DELETE FROM discord WHERE channel IN (' + channels.map( row => '?' ).join('|') + ')', channels, function (delerror) {
					if ( delerror ) {
						console.log( '- Error while removing the settings: ' + delerror );
						return delerror;
					}
					console.log( '- Settings successfully removed.' );
				} );
			} );
		}
		
		return msg.replyMsg( text, {split:true}, true );
	} );
}

module.exports = {
	name: 'settings',
	everyone: true,
	pause: true,
	owner: false,
	run: cmd_settings
};