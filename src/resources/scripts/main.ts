import $ from 'jquery';
import { gt, coerce } from 'semver';
import { inflate, deflate } from 'pako';
// @ts-expect-error
import idbExportImport from 'indexeddb-export-import';
import { inject } from '@vercel/analytics';

// Initialize Vercel Web Analytics
inject();

declare global {
	interface Window {
		console: Console;
		gameWindow: Window | null;
		gameWindowIframe: Window | null;
		game: {
			play: (version?: string) => void;
			stop: (error?: string) => void;
		};
	}
}

let selectedVersion: string | undefined = undefined;
let articleAnimationLock = false;

const theme = {
	load: function (themeToLoad?: string) {
		const themeElement = document.querySelector(
			'#theme',
		) as HTMLLinkElement | null;
		if (themeElement)
			themeElement.href = themeToLoad
				? `/resources/styles/themes/${themeToLoad}.css`
				: `/resources/styles/themes/${storage.local.get('theme') ?? 'default'}.css`;
	},
	set: function (newTheme: string) {
		storage.local.set('theme', newTheme);
		theme.load();
	},
};

const versionSelector = {
	open: function () {
		const options = document.querySelector('.installations div .options');
		const selector = document.querySelector('.installations div .selector');
		if (options && selector) {
			options.classList.add('open');
			selector.classList.add('open');
		}
	},
	close: function () {
		const options = document.querySelector('.installations div .options');
		const selector = document.querySelector('.installations div .selector');
		if (options && selector) {
			options.classList.remove('open');
			selector.classList.remove('open');
		}
	},
	toggle: function () {
		const options = document.querySelector('.installations div .options');
		const selector = document.querySelector('.installations div .selector');
		if (options && selector) {
			options.classList.toggle('open');
			selector.classList.toggle('open');
		}
	},
};

function consoleLog(
	type: 'debug' | 'log' | 'info' | 'warn' | 'error',
	msg: string,
) {
	if (type === 'info') {
		if (msg.includes('DEBUG')) type = 'debug';
		else if (msg.includes('LOG')) type = 'log';
		else if (msg.includes('INFO')) type = 'info';
		else if (msg.includes('WARN')) type = 'warn';
		else if (msg.includes('ERROR')) type = 'error';
	}

	const consoleElement = document.querySelector('.console');
	if (consoleElement) {
		const scrolledToBottom =
			Math.abs(
				consoleElement.scrollHeight -
					consoleElement.scrollTop -
					consoleElement.clientHeight,
			) === 0;
		const messageElement = document.createElement('span');
		messageElement.classList.add(type);
		messageElement.innerText = msg;
		consoleElement.append(messageElement);
		storage.session.set('console', consoleElement.innerHTML);
		if (scrolledToBottom) consoleElement.scroll(0, consoleElement.scrollHeight);
	}
}

const game = {
	play: function (version?: string) {
		if (window !== window.top)
			window.top?.game.play(version ?? selectedVersion);
		else {
			version = version ?? selectedVersion;
			if (!version) {
				alert('Please select a version to play.');
				return;
			}
			storage.session.set('lastGame', selectedVersion);

			storage.session.set('playingGame', true);
			const console = document.querySelector('.console') as HTMLElement | null;
			if (console) console.style.display = 'flex';

			if (!window.gameWindow || window.gameWindow.closed) {
				const noPopup = storage.local.get('noPopup');
				window.gameWindow = window.open(
					noPopup ? version : 'about:blank',
					'_blank',
					`popup=${noPopup ? 'false' : 'true'}`,
				);
				if (window.gameWindow) {
					if (!noPopup) {
						window.gameWindow.document.title = 'MineXLauncher';
						const icon = window.gameWindow.document.createElement('link');
						icon.rel = 'icon';
						icon.href = '/resources/images/icons/favicon.webp';
						window.gameWindow.document.head.append(icon);

						const iframe = window.gameWindow.document.createElement('iframe');
						iframe.src = version;
						iframe.width = '100%';
						iframe.height = '100%';
						iframe.style.position = 'fixed';
						iframe.style.top = '0';
						iframe.style.left = '0';
						iframe.style.border = 'none';
						window.gameWindow.document.body.append(iframe);

						['keydown', 'keyup'].forEach((eventType) =>
							window.gameWindow?.addEventListener(eventType, (event) =>
								iframe.contentWindow?.dispatchEvent(
									new KeyboardEvent(eventType, event),
								),
							),
						);
						window.gameWindowIframe = iframe.contentWindow;
					} else window.gameWindowIframe = window.gameWindow;
					if (window.gameWindowIframe) {
						(
							['debug', 'log', 'info', 'warn', 'error'] as (
								| 'debug'
								| 'log'
								| 'info'
								| 'warn'
								| 'error'
							)[]
						).forEach((type) => {
							if (window.gameWindowIframe)
								window.gameWindowIframe.console[type] = (msg: string) =>
									consoleLog(type, msg);
						});
					}
					window.gameWindow.focus();
					window.gameWindow.document.documentElement.requestFullscreen();
				}
			} else {
				window.gameWindow.focus();
				const console = document.querySelector(
					'.console',
				) as HTMLElement | null;
				if (console) console.style.display = 'flex';
			}

			const waitForCrash = setInterval(() => {
				if (window.gameWindow?.closed) {
					clearInterval(waitForCrash);
					game.stop(undefined, { killed: true });
				} else {
					window.gameWindowIframe?.document
						.querySelectorAll('div')
						.forEach((element: HTMLElement) => {
							if (
								element.innerText.includes(
									"Game Crashed! I have fallen and I can't get up!",
								)
							) {
								clearInterval(waitForCrash);
								game.stop(element.innerText);
							}
						});
				}
			}, 50);
		}
	},
	stop: function (error?: string, options?: { killed: boolean }) {
		if (window !== window.top) window.top?.game.stop(error);
		else {
			if (
				window.gameWindow &&
				(!window.gameWindow.closed || options?.killed) &&
				window.gameWindowIframe
			) {
				window.gameWindow.onbeforeunload = null;
				window.gameWindowIframe.onbeforeunload = null;
				window.gameWindow.close();
				storage.session.set('playingGame', false);
				if (error) {
					consoleLog('error', 'MineXLauncher: Game crashed with error:');
					consoleLog('error', error);
				} else {
					consoleLog('error', 'MineXLauncher: Game process killed by user');
				}
				window.focus();
			}
		}
	},
	select: function (path: string, name?: string) {
		selectedVersion = path;
		const selector = document.querySelector('.installations div .selector');
		if (selector?.textContent) {
			if (name) selector.textContent = `Selected: ${name}`;
			else selector.textContent = `Selected: ${path}`;
		}
		versionSelector.close();
	},
	archive: function (client: string) {
		const clients: Record<string, string> = {
			'1.8': '18-client-version',
			'1.5': '15-client-version',
			'b1.3': 'b13-client-version',
		};
		const dropdown = clients[client]
			? (document.querySelector(
					`select[id='${clients[client]}']`,
				) as HTMLSelectElement | null)
			: null;
		if (dropdown?.value) {
			selectedVersion = `https://archive.eaglercraft.rip/Eaglercraft${client === '1.8' ? 'X_1.8' : `_${client}`}/client/${dropdown.value}/index.html`;
			game.play();
		}
	},
};

const navigate = {
	home: {
		game: function () {
			document.body.style.display = 'none';
			const navUrl = '/home/game/';
			storage.session.set('lastPage', navUrl);
			window.location.href = navUrl;
		},
		clients: function () {
			document.body.style.display = 'none';
			const navUrl = '/home/clients/';
			storage.session.set('lastPage', navUrl);
			window.location.href = navUrl;
		},
		announcements: function () {
			document.body.style.display = 'none';
			const navUrl = '/home/announcements/';
			storage.session.set('lastPage', navUrl);
			window.location.href = navUrl;
		},
		hackedClients: function () {
			document.body.style.display = 'none';
			const navUrl = '/home/hacked-clients/';
			storage.session.set('lastPage', navUrl);
			window.location.href = navUrl;
		},
		archive: function () {
			document.body.style.display = 'none';
			const navUrl = '/home/archive/';
			storage.session.set('lastPage', navUrl);
			window.location.href = navUrl;
		},
		downloads: function () {
			document.body.style.display = 'none';
			const navUrl = '/home/downloads/';
			storage.session.set('lastPage', navUrl);
			window.location.href = navUrl;
		},
	},
	addons: {
		mods: function () {
			document.body.style.display = 'none';
			const navUrl = '/addons/mods/';
			storage.session.set('lastPage', navUrl);
			window.location.href = navUrl;
		},
		resourcepacks: function () {
			document.body.style.display = 'none';
			const navUrl = '/addons/resourcepacks/';
			storage.session.set('lastPage', navUrl);
			window.location.href = navUrl;
		},
	},
	settings: {
		general: function () {
			const navUrl = '/settings/general/';
			storage.session.set('lastPage', navUrl);
			window.location.href = navUrl;
		},
		backups: function () {
			const navUrl = '/settings/backups/';
			storage.session.set('lastPage', navUrl);
			window.location.href = navUrl;
		},
	},
	articles: function () {
		const navUrl = '/articles/';
		storage.session.set('lastPage', navUrl);
		window.location.href = navUrl;
	},
	updates: function () {
		const navUrl = '/updates/';
		storage.session.set('lastPage', navUrl);
		window.location.href = navUrl;
	},
	servers: function () {
		const navUrl = '/servers/';
		storage.session.set('lastPage', navUrl);
		window.location.href = navUrl;
	},
};

function openAboutBlank(
	url: string,
	options?: { title?: string; favicon?: string },
): Window | null {
	const newWindow = window.open('about:blank', '_blank', 'popup');
	if (newWindow) {
		if (options?.title) newWindow.document.title = options.title;
		if (options?.favicon) {
			const icon = newWindow.document.createElement('link');
			icon.rel = 'icon';
			icon.href = options.favicon;
			newWindow.document.head.append(icon);
		}

		const iframe = newWindow.document.createElement('iframe');
		iframe.src = url;
		iframe.width = '100%';
		iframe.height = '100%';
		iframe.style.position = 'fixed';
		iframe.style.top = '0';
		iframe.style.left = '0';
		iframe.style.border = 'none';
		newWindow.onbeforeunload = () => newWindow.close();
		newWindow.document.body.append(iframe);
	}
	return newWindow;
}

const article = {
	open: function (articleId: string) {
		const modal = document.querySelector(
			`.article[data-article-id='${articleId}']`,
		) as HTMLElement | null;
		const modalContent = document.querySelector(
			`.article[data-article-id='${articleId}'] > div`,
		) as HTMLElement | null;
		if (!articleAnimationLock && modal && modalContent) {
			articleAnimationLock = true;
			modal.style.animation = '0.5s ease-in-out 1 normal article';
			modal.style.display = 'flex';
			modalContent.scroll({ top: 0, left: 0, behavior: 'instant' });
			modal.addEventListener(
				'animationend',
				() => {
					const closeArticleHandler = (event: Event) => {
						if (event.target === modal) {
							modal.removeEventListener('click', closeArticleHandler);
							article.close(articleId);
						}
					};
					modal.addEventListener('click', closeArticleHandler);
					articleAnimationLock = false;
				},
				{ once: true },
			);
		}
	},
	close: function (articleId: string) {
		const modal = document.querySelector(
			`.article[data-article-id='${articleId}']`,
		) as HTMLElement | null;
		if (!articleAnimationLock && modal) {
			articleAnimationLock = true;
			modal.style.animation = '0.5s ease-in-out 1 reverse article-tempfix';
			modal.addEventListener(
				'animationend',
				() => {
					modal.style.display = 'none';
					articleAnimationLock = false;
				},
				{ once: true },
			);
		}
	},
};

/*const cookie = {
	set: function (key: string, value: string | number | object | [] | boolean | null | undefined, days: number) {
		let maxAge;
		if (days) {
			maxAge = days * 60 * 60 * 24;
		} else {
			maxAge = 31536000;
		}
		document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure`;
	},
	get: function (key: string) {
		for (const cookie of document.cookie.split('; ')) {
			const cookiePair = cookie.split('=');
			if (encodeURIComponent(key) === cookiePair[0]) {
				return decodeURIComponent(cookiePair[1]);
			}
		}
		return undefined;
	},
	delete: function (key: string) {
		document.cookie = `${encodeURIComponent(key)}=; Max-Age=0; Path=/`;
	},
};*/

const storage = {
	local: {
		get: function (key: string) {
			const item = localStorage.getItem('minexlauncher-v2');
			if (item !== null) {
				const json = JSON.parse(base64Gzip.decompress(item));
				if (json[key] !== undefined) {
					return json[key];
				}
				return undefined;
			}
			return undefined;
		},
		set: function (
			key: string,
			value: string | number | object | boolean | null | undefined,
		) {
			const item = localStorage.getItem('minexlauncher-v2');
			if (item === null) {
				const json: Record<string, unknown> = {};
				json[key] = value;
				localStorage.setItem(
					'minexlauncher-v2',
					base64Gzip.compress(JSON.stringify(json)),
				);
			} else {
				const json = JSON.parse(base64Gzip.decompress(item));
				json[key] = value;
				localStorage.setItem(
					'minexlauncher-v2',
					base64Gzip.compress(JSON.stringify(json)),
				);
			}
		},
	},
	session: {
		get: function (key: string) {
			const item = sessionStorage.getItem('minexlauncher-v2');
			if (item !== null) {
				const json = JSON.parse(base64Gzip.decompress(item));
				if (json[key] !== undefined) {
					return json[key];
				}
				return undefined;
			}
			return undefined;
		},
		set: function (
			key: string,
			value: string | number | object | boolean | null | undefined,
		) {
			const item = sessionStorage.getItem('minexlauncher-v2');
			if (item === null) {
				const json: Record<string, unknown> = {};
				json[key] = value;
				sessionStorage.setItem(
					'minexlauncher-v2',
					base64Gzip.compress(JSON.stringify(json)),
				);
			} else {
				const json = JSON.parse(base64Gzip.decompress(item));
				json[key] = value;
				sessionStorage.setItem(
					'minexlauncher-v2',
					base64Gzip.compress(JSON.stringify(json)),
				);
			}
		},
	},
};

const query = {
	get: function (name: string) {
		return new URLSearchParams(window.top?.location.search).get(name);
	},
};

const detect = {
	mobile: function (): boolean {
		try {
			document.exitPointerLock();
			return /Mobi/i.test(window.navigator.userAgent);
		} catch {
			return true;
		}
	},
	landscape: function () {
		return window.innerWidth > window.innerHeight;
	},
};

const addons = {
	mods: {
		toggle: function (modId: string): void {
			const mod = `/resources/addons/${modId}.js`;
			const addons: { mods: string[] } = storage.local.get('addons') ?? {
				mods: [],
			};
			const modIndex = addons.mods.indexOf(mod);
			if (modIndex === -1) {
				addons.mods.push(mod);
				addons.mods.sort();
				storage.local.set('addons', addons);
				const modInstallElem = document.querySelector(
					`.mod-list > div .links .install[data-mod-id='${modId}']`,
				);
				if (modInstallElem) {
					modInstallElem.classList.add('installed');
					modInstallElem.textContent = 'Uninstall';
				}
			} else {
				addons.mods.splice(modIndex, 1);
				storage.local.set('addons', addons);
				const modInstallElem = document.querySelector(
					`.mod-list > div .links .install[data-mod-id='${modId}']`,
				);
				if (modInstallElem) {
					modInstallElem.classList.remove('installed');
					modInstallElem.textContent = 'Install';
				}
			}
		},
	},
};

const backups = {
	export: async function () {
		const exportData: {
			cookies: Record<string, string>;
			localStorage: Record<string, string>;
			indexedDb: Record<string, string>;
		} = {
			cookies: {},
			localStorage: { ...localStorage },
			indexedDb: {},
		};

		document.cookie.split('; ').forEach((cookie) => {
			const pair = cookie.split('=');
			if (pair[0] !== undefined && pair[1] !== undefined)
				exportData.cookies[pair[0]] = pair[1];
		});

		for (const dbInfo of await indexedDB.databases()) {
			if (dbInfo.name)
				indexedDB.open(dbInfo.name).onsuccess = (event) =>
					(exportData.indexedDb[dbInfo.name ?? ''] =
						idbExportImport.exportToJsonString(
							(event.target as IDBOpenDBRequest).result,
						));
		}

		const url = URL.createObjectURL(
			new Blob([base64Gzip.compress(JSON.stringify(exportData))]),
		);
		const a = document.createElement('a');
		a.href = url;
		a.target = '_blank';
		a.download = `MineXLauncher_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.backup`;
		document.body.append(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	},
	import: async function () {
		await new Promise<File>((resolve, reject) => {
			const fileInput = document.createElement('input');
			fileInput.type = 'file';
			fileInput.accept = '.backup';
			fileInput.multiple = false;
			fileInput.onchange = (event) => {
				const file = (event.target as HTMLInputElement).files?.[0];
				if (file) resolve(file);
				else reject();
			};
			fileInput.oncancel = () => reject();
			document.body.append(fileInput);
			fileInput.click();
			document.body.removeChild(fileInput);
		})
			.then(async (file) => {
				const importData = JSON.parse(base64Gzip.decompress(await file.text()));

				// @ts-expect-error
				if (typeof cookieStore !== 'undefined')
					// @ts-expect-error
					await cookieStore.getAll().then((cookies: object[]) =>
						// @ts-expect-error
						cookies.forEach((cookie) => cookieStore.delete(cookie)),
					);
				else
					document.cookie
						.split('; ')
						.forEach(
							(cookie) =>
								(document.cookie = `${cookie.split('=')[0]}=; Path=/; Max-Age=0`),
						);

				localStorage.clear();

				for (const dbInfo of await indexedDB.databases())
					if (dbInfo.name) indexedDB.deleteDatabase(dbInfo.name);

				for (const key in importData.localStorage)
					if (importData.localStorage[key] !== undefined)
						localStorage.setItem(key, importData.localStorage[key]);

				for (const key in importData.cookies)
					document.cookie = `${key}=${importData.cookies[key]}; Max-Age=${365 * 24 * 60 * 60}; Path=/; SameSite=Lax; Secure`;

				if (Object.keys(importData.indexedDb).length > 0)
					for (const dbName in importData.indexedDb) {
						const dbRequest = indexedDB.open(dbName);
						dbRequest.onsuccess = async (event) => {
							const db = (event.target as IDBOpenDBRequest).result;
							const transaction = db.transaction(
								Array.from(db.objectStoreNames),
								'readwrite',
							);

							for (const storeName of Array.from(db.objectStoreNames))
								transaction.objectStore(storeName).clear();

							transaction.oncomplete = () =>
								idbExportImport.importFromJsonString(
									db,
									importData.indexedDb[dbName],
								);
						};
					}
				window.location.reload();
			})
			.catch((error) => console.error(error));
	},
};

const sw = {
	register: function (url: string) {
		if ('serviceWorker' in navigator) {
			window.addEventListener('load', () => {
				navigator.serviceWorker.register(url).then(() => {
					navigator.serviceWorker.addEventListener('message', (event) => {
						if (event.origin === window.location.origin) {
							if (event.data.title === 'sw-install-complete') {
								alert('MineXLauncher is now ready for offline use!');
							}
						}
					});
				});
			});
		}
	},
};

const base64Gzip = {
	compress: function (string: string): string {
		return btoa(
			String.fromCharCode(...deflate(new TextEncoder().encode(string))),
		);
	},
	decompress: function (string: string): string {
		return inflate(
			Uint8Array.from(atob(string), (c) => c.charCodeAt(0)),
			{ to: 'string' },
		);
	},
};

function downloadFile(url: string, name?: string) {
	const a = document.createElement('a');
	a.href = url;
	a.download = name ?? '';
	document.body.append(a);
	a.click();
	document.body.removeChild(a);
}

if (window.location.pathname === '/') {
	const lastPage = storage.session.get('lastPage');
	const iframe = document.createElement('iframe');
	iframe.src = !storage.local.get('lastVersion')
		? '/welcome/'
		: lastPage
			? lastPage
			: '/home/game/';

	document.addEventListener('DOMContentLoaded', () => {
		document.body.append(iframe);
		const consoleElement = document.querySelector(
			'.console',
		) as HTMLElement | null;
		if (consoleElement) {
			const consoleHistory = storage.session.get('console');
			if (consoleHistory) {
				consoleElement.innerHTML = consoleHistory;
				consoleElement.style.display = 'flex';
				consoleElement.scroll(0, consoleElement.scrollHeight);
			}
			consoleElement.style.display = storage.session.get('playingGame')
				? 'flex'
				: '';
		}
	});

	/* document.addEventListener('load', () => {
		if (storage.local.get('offlineCache')) {
			sw.register('/sw-full.js');
		} else {
			sw.register('/sw.js');
		}
	}); */
	document.addEventListener('load', () => sw.register('/sw.js'));
	window.addEventListener('beforeunload', () => game.stop());

	window.addEventListener('beforeinstallprompt', (event) => {
		// @ts-expect-error
		if (iframe.contentWindow) iframe.contentWindow.installPwaEvent = event;
	});
} else {
	if (detect.mobile()) {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = '/resources/styles/mobile.css';
		document.head.append(link);
	}

	theme.load();

	document.addEventListener('DOMContentLoaded', async () => {
		const profileName = document.querySelector('.username');
		const titleBarText = document.querySelector('.title-bar');

		const lastVersion = storage.local.get('lastVersion');
		const updateData = (await (await fetch('/resources/data/main.json')).json())
			.updates;
		const currentVersion = updateData[0].version;
		const changelog = updateData[0].changelog
			.map((change: string) => `  - ${change}`)
			.join('\n');

		if (profileName) profileName.textContent = storage.local.get('username');
		if (titleBarText) titleBarText.textContent += ` ${currentVersion}`;

		if (
			lastVersion &&
			gt(
				// @ts-expect-error
				coerce(currentVersion, { includePrerelease: true }),
				coerce(lastVersion, { includePrerelease: true }),
			)
		) {
			alert(
				`MineXLauncher has been updated to v${currentVersion}!\n\nChanges in v${currentVersion}:\n${changelog}`,
			);
			storage.local.set('lastVersion', currentVersion);
		}
	});

	/* if (storage.local.get('showAds')) {
		const googleAdsScript = document.createElement('script');
		googleAdsScript.async = true;
		googleAdsScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1132419379737567';
		googleAdsScript.crossOrigin = 'anonymous';
		document.head.append(googleAdsScript);

		document.addEventListener('DOMContentLoaded', () => {
			const googleAdsPush = document.createElement('script');
			googleAdsPush.text = '(adsbygoogle = window.adsbygoogle || []).push({});';
			document.body.append(googleAdsPush);

			const adsContainers = document.querySelectorAll('.ads-container');
			adsContainers.forEach((adsContainer) => {
				adsContainer.style.display = 'flex';
			});
		});
	} */
}

if (window.location.pathname === '/settings/general/') {
	document.addEventListener('DOMContentLoaded', async () => {
		const profileName = document.querySelector('.username');
		const usernameInput = document.querySelector(
			'#username-input',
		) as HTMLInputElement | null;
		const themeSelect = document.querySelector(
			'#theme-select',
		) as HTMLSelectElement | null;
		const noPopupCheckbox = document.querySelector(
			'#no-popup-checkbox',
		) as HTMLInputElement | null;
		const offlineCheckbox = document.querySelector(
			'#offline-checkbox',
		) as HTMLInputElement | null;
		const adsCheckbox = document.querySelector(
			'#ads-checkbox',
		) as HTMLInputElement | null;
		const themeData: { id: string; name: string }[] = (
			await (await fetch('/resources/data/main.json')).json()
		).themes;

		if (usernameInput) {
			usernameInput.placeholder = storage.local.get('username') ?? '';
			usernameInput.addEventListener('input', () => {
				let username = usernameInput.value
					.replace(/[^A-Za-z0-9]/g, '_')
					.substring(0, 16);
				usernameInput.value = username;
				while (username.length < 3) username += '_';

				storage.local.set('username', username);
				if (profileName) profileName.textContent = username;
			});
		}

		if (themeSelect) {
			themeData.forEach((theme: { id: string; name: string }) => {
				const option = document.createElement('option');
				option.value = theme.id;
				option.textContent = theme.name;
				themeSelect?.append(option);
			});
			themeSelect.value = storage.local.get('theme') ?? '';
			themeSelect.addEventListener('change', () =>
				theme.set(themeSelect.value ?? 'default'),
			);
		}

		if (noPopupCheckbox) {
			noPopupCheckbox.checked = storage.local.get('noPopup');
			noPopupCheckbox.addEventListener('change', () =>
				storage.local.set('noPopup', noPopupCheckbox.checked),
			);
		}

		if (offlineCheckbox) {
			offlineCheckbox.checked = storage.local.get('offlineCache') ?? false;
			offlineCheckbox.addEventListener('change', () => {
				storage.local.set('offlineCache', offlineCheckbox.checked);
				if (offlineCheckbox.checked) {
					sw.register('/sw-full.js');
					alert(
						'Offline cache is now downloading.\nThe download size is about 1GB, so it may take a while.\n\nPlease do not leave this page while the download is in progress.\nYou will be notified when the download is complete.',
					);
				} else {
					sw.register('/sw.js');
					alert('Offline cache has been deleted.');
				}
			});
		}

		if (adsCheckbox) {
			adsCheckbox.checked = storage.local.get('showAds');
			adsCheckbox.addEventListener('change', () => {
				storage.local.set('showAds', adsCheckbox.checked);
				const adsContainers = document.querySelectorAll('.ads-container');
				adsContainers.forEach(
					(adsContainer: Element) =>
						((adsContainer as HTMLElement).style.display = 'none'),
				);
			});
		}
	});
} else if (window.location.pathname === '/welcome/') {
	document.addEventListener('DOMContentLoaded', async () => {
		const setupForm = document.querySelector(
			'#setup-form',
		) as HTMLFormElement | null;
		const usernameInput = document.querySelector(
			'#username-input',
		) as HTMLInputElement | null;
		const themeSelect = document.querySelector(
			'#theme-select',
		) as HTMLSelectElement | null;
		const offlineCheckbox = document.querySelector(
			'#offline-checkbox',
		) as HTMLInputElement | null;
		const themeData: { id: string; name: string }[] = (
			await (await fetch('/resources/data/main.json')).json()
		).themes;

		if (setupForm) {
			if (usernameInput) {
				usernameInput.addEventListener('input', () => {
					const username = usernameInput.value
						.replace(/[^A-Za-z0-9]/g, '_')
						.substring(0, 16);
					usernameInput.value = username;
				});
			}

			if (themeSelect) {
				themeData.forEach((theme: { id: string; name: string }) => {
					const option = document.createElement('option');
					option.value = theme.id;
					option.textContent = theme.name;
					themeSelect?.append(option);
				});
				themeSelect.addEventListener('change', () =>
					theme.load(themeSelect.value ?? 'default'),
				);
			}

			setupForm.addEventListener('submit', async (event) => {
				event.preventDefault();

				let username = usernameInput?.value
					.replace(/[^A-Za-z0-9]/g, '_')
					.substring(0, 16);
				if (usernameInput) usernameInput.value = username ?? '';

				if (!username) {
					alert('Please type a username.');
					return;
				} else {
					while (username.length < 3) username += '_';

					storage.local.set('username', username);
					storage.local.set('theme', themeSelect?.value ?? 'default');
					storage.local.set('noPopup', false);
					// storage.local.set('offlineCache', offlineCheckbox?.checked ?? false);
					// storage.local.set('showAds', true);
					storage.local.set('addons', { mods: [] });
					storage.local.set(
						'lastVersion',
						(await (await fetch('/resources/data/main.json')).json()).updates[0]
							.version,
					);

					if (offlineCheckbox?.checked) {
						sw.register('/sw-full.js');
						alert(
							'Offline cache is now downloading.\nThe download size is about 1GB, so it may take a while.\n\nPlease do not leave this page while the download is in progress.\nYou will be notified when the download is complete.',
						);
					} else sw.register('/sw.js');

					// @ts-expect-error
					window.top.location.href = '/';
				}
			});
		}
	});
} else if (
	window.location.pathname === '/addons/mods/' ||
	window.location.pathname === '/addons/resourcepacks/'
) {
	document.addEventListener('DOMContentLoaded', async () => {
		const addonType: 'mods' | 'resourcepacks' =
			window.location.pathname === '/addons/mods/' ? 'mods' : 'resourcepacks';
		const addons: {
			mods: {
				id: string;
				name: string;
				description: string;
				author: string;
				authorLink: string;
				source: string;
			}[];
			resourcepacks: {
				id: string;
				name: string;
				description: string;
				author: string;
				authorLink: string;
				source: string;
			}[];
		} = (await (await fetch('/resources/data/main.json')).json()).addons;
		const addonList = document.querySelector('.mod-list');
		addons[addonType].forEach((addon) => {
			const addonItem = document.createElement('div');
			addonItem.innerHTML = `<img loading="lazy" src="/resources/images/icons/addons/${addon.id}.webp" /><div class="details"><strong>${
				addon.name
			}</strong><p class="author">By <a href="${addon.authorLink}" target="_blank">${addon.author}</a></p><p class="description">${addon.description}</p></div><div class="links">${
				addonType === 'mods'
					? `<span class="download" onclick="downloadFile('/resources/addons/${addon.id}.js', '${addon.name.replace('\\', '\\\\').replace("'", "\\'")}.js')">Download</span><span class="install" data-mod-id="${addon.id}" onclick="addons.mods.toggle('${addon.id}')">Install</span>`
					: `<span class="download" onclick="downloadFile('/resources/addons/${addon.id}.zip', '${addon.name.replace('\\', '\\\\').replace("'", "\\'")}.zip')">Download</span>`
			}</div>`;
			addonList?.append(addonItem);
		});

		if (addonType === 'mods') {
			const installedMods = storage.local.get('addons').mods ?? [];
			const modElements = document.querySelectorAll(
				'.mod-list > div .links .install',
			);
			modElements.forEach((element) => {
				const modId = (element as HTMLElement).dataset['modId'];
				if (installedMods.includes(`/resources/addons/${modId}.js`)) {
					element.classList.add('installed');
					element.textContent = 'Uninstall';
				}
			});
		}
	});
} else if (window.location.pathname === '/updates/') {
	document.addEventListener('DOMContentLoaded', async () => {
		const updatesContainer = document.querySelector('.updates-container');
		const data: { version: string; changelog: string[] }[] = (
			await (await fetch('/resources/data/main.json')).json()
		).updates;
		data.forEach((update) => {
			const version = document.createElement('div');
			const name = document.createElement('strong');
			name.textContent = `MineXLauncher ${update.version}`;

			const changes = document.createElement('ul');
			update.changelog.forEach((change) => {
				const item = document.createElement('li');
				item.textContent = change;
				changes.append(item);
			});

			version.append(name);
			version.append(changes);
			updatesContainer?.append(version);
		});
	});
} else if (
	window.location.pathname === '/home/game/' ||
	window.location.pathname === '/home/clients/'
) {
	const lastGame = storage.session.get('lastGame');
	if (lastGame) game.select(lastGame);
}

if (window.location.hostname === null) {
	// Stop the minifier from removing these functions
	console.debug([
		navigate,
		query,
		versionSelector,
		game,
		addons,
		base64Gzip,
		article,
		downloadFile,
		backups,
		consoleLog,
		openAboutBlank,
		$,
		detect,
	]);
}
