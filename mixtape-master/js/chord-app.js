"use strict";

// Ưu tiên đọc cấu hình runtime từ Vercel env qua /api/config.
const RUNTIME_CONFIG_ENDPOINT = "/api/config";
const _cfg = window.CHORD_CONFIG || {};
let API_BASE_URL = (_cfg.apiBaseUrl || "").replace(/\/$/, "");
const ADMIN_TOKEN_STORAGE_KEY = "trung-beo-admin-token";
let ADMIN_TOKEN = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
const FONT_SIZE_STORAGE_KEY = "trungbeo_chords_font_size";
const SCROLL_SPEED_STORAGE_KEY = "trungbeo_chords_scroll_speed";
const FONT_SIZE_MIN = 14;
const FONT_SIZE_DEFAULT = 18;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_STEP = 2;
const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_INDEX = {
	"C": 0, "B#": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
	"E": 4, "Fb": 4, "E#": 5, "F": 5, "F#": 6, "Gb": 6, "G": 7,
	"G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11, "Cb": 11
};

const DEMO_SONGS = [
	{
		id: "demo-1",
		title: "Ngày Em Đến",
		artist: "Demo ChordPro",
		key: "C",
		genre: "Ballad",
		content: `{title: Ngày Em Đến}
{artist: Demo ChordPro}
{key: C}

{start_of_verse: Verse 1}
[C]Ngày em [G]đến, trời bỗng [Am]xanh hơn
[F]Gió mang câu [C]hát đi qua [Dm]hiên nhà [G]
[C]Mình ngồi bên [G]nhau, nghe phố [Am]thở thật gần
[F]Và bình yên [G]rơi giữa đôi [C]ta
{end_of_verse}

{start_of_chorus: Điệp khúc}
[F]Dẫu mai này [G]đường xa, [Em]dẫu mưa qua [Am]mái nhà
[Dm]Ta vẫn giữ [G]một bài ca [C]chưa phai
[F]Nắm tay thật [G]chặt nhé, [Em]hát thêm một [Am]lần nhé
[Dm]Cho thanh xuân [G]ở lại nơi [C]này
{end_of_chorus}`
	},
	{
		id: "demo-2",
		title: "Thành Phố Sau Mưa",
		artist: "Trung Béo",
		key: "Am",
		genre: "Acoustic",
		content: `{title: Thành Phố Sau Mưa}
{artist: Trung Béo}
{key: Am}

{comment: Intro}
[Am]  [F]  [C]  [G]

{comment: Verse}
[Am]Thành phố sau mưa, [F]đèn nghiêng qua ô cửa
[C]Có ai đang chờ [G]một câu chưa kịp nói
[Am]Ngày tháng đi qua, [F]mình vẫn nghe rất lạ
[C]Tiếng đàn hôm nào [G]còn ngân trong đêm [Am]dài`
	},
	{
		id: "demo-3",
		title: "Một Vòng Việt Nam",
		artist: "Demo Library",
		key: "D",
		genre: "Pop",
		content: `{title: Một Vòng Việt Nam}
{artist: Demo Library}
{key: D}

[D]Đi một vòng Việt Nam, [A]nghe quê hương gọi tên
[Bm]Qua bao nhiêu miền đất [G]thấy tim mình gần thêm
[D]Mang theo câu hò xưa [A]đến nơi chân trời mới
[G]Ta hát vang cùng [A]nhau giữa đất [D]trời`
	}
];

const state = {
	songs: [],
	activeSong: null,
	transpose: 0,
	apiOnline: false,
	pendingAction: null,
	editingSongId: null,
	fontSize: readStoredNumber(FONT_SIZE_STORAGE_KEY, FONT_SIZE_DEFAULT, FONT_SIZE_MIN, FONT_SIZE_MAX),
	scrollSpeed: readStoredNumber(SCROLL_SPEED_STORAGE_KEY, 4, 1, 10),
	autoScrollActive: false,
	autoScrollFrame: null,
	lastScrollFrameTime: null,
	fullscreenStage: false
};

const elements = {
	songList: document.querySelector("#songList"),
	songCount: document.querySelector("#songCount"),
	apiStatus: document.querySelector("#apiStatus"),
	authStatus: document.querySelector("#authStatus"),
	authButton: document.querySelector("#authButton"),
	openSongForm: document.querySelector("#openSongForm"),
	editSongButton: document.querySelector("#editSongButton"),
	deleteSongButton: document.querySelector("#deleteSongButton"),
	adminActions: document.querySelector("#adminActions"),
	search: document.querySelector("#songSearch"),
	title: document.querySelector("#songTitle"),
	artist: document.querySelector("#songArtist"),
	tags: document.querySelector("#songTags"),
	key: document.querySelector("#currentKey"),
	transposeValue: document.querySelector("#transposeValue"),
	sheet: document.querySelector("#chordSheet"),
	fontDecrease: document.querySelector("#fontDecrease"),
	fontIncrease: document.querySelector("#fontIncrease"),
	fontSizeValue: document.querySelector("#fontSizeValue"),
	autoScrollToggle: document.querySelector("#autoScrollToggle"),
	scrollSpeed: document.querySelector("#scrollSpeed"),
	scrollSpeedValue: document.querySelector("#scrollSpeedValue"),
	scrollTopButton: document.querySelector("#scrollTopButton"),
	fullscreenToggle: document.querySelector("#fullscreenToggle"),
	modal: document.querySelector("#songModal"),
	modalEyebrow: document.querySelector("#songModalEyebrow"),
	form: document.querySelector("#songForm"),
	formMessage: document.querySelector("#formMessage"),
	loginModal: document.querySelector("#loginModal"),
	loginForm: document.querySelector("#loginForm"),
	loginMessage: document.querySelector("#loginMessage"),
	sidebar: document.querySelector("#sidebar"),
	sidebarBackdrop: document.querySelector("#sidebarBackdrop")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
	await loadRuntimeConfig();
	bindEvents();
	applyStoredStageSettings();
	await validateAdminSession();
	updateAuthUi();
	await loadSongs();
}

async function loadRuntimeConfig() {
	try {
		const response = await fetch(RUNTIME_CONFIG_ENDPOINT, {
			headers: { "Accept": "application/json" },
			cache: "no-store"
		});
		if (!response.ok) return;
		const runtime = await response.json();
		if (runtime.apiBaseUrl) {
			API_BASE_URL = String(runtime.apiBaseUrl).replace(/\/$/, "");
		}
	} catch (error) {
		// Giữ nguyên fallback từ window.CHORD_CONFIG khi endpoint không tồn tại.
	}
}

function bindEvents() {
	elements.search.addEventListener("input", () => renderSongList(elements.search.value));
	document.querySelector("#transposeDown").addEventListener("click", () => changeTranspose(-1));
	document.querySelector("#transposeUp").addEventListener("click", () => changeTranspose(1));
	document.querySelector("#resetTranspose").addEventListener("click", () => setTranspose(0));
	elements.fontDecrease.addEventListener("click", () => changeFontSize(-FONT_SIZE_STEP));
	elements.fontIncrease.addEventListener("click", () => changeFontSize(FONT_SIZE_STEP));
	elements.autoScrollToggle.addEventListener("click", toggleAutoScroll);
	elements.scrollSpeed.addEventListener("input", handleScrollSpeedChange);
	elements.scrollTopButton.addEventListener("click", scrollToSongTop);
	elements.fullscreenToggle.addEventListener("click", toggleFullscreenStage);
	elements.openSongForm.addEventListener("click", openSongEntryForm);
	elements.editSongButton.addEventListener("click", openEditSongForm);
	elements.deleteSongButton.addEventListener("click", deleteActiveSong);
	elements.authButton.addEventListener("click", handleAuthButtonClick);
	document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));
	document.querySelectorAll("[data-close-login-modal]").forEach((button) => button.addEventListener("click", closeLoginModal));
	document.querySelector("#sidebarToggle").addEventListener("click", openSidebar);
	document.querySelector("#closeSidebar").addEventListener("click", closeSidebar);
	elements.sidebarBackdrop.addEventListener("click", closeSidebar);
	elements.form.addEventListener("submit", saveSong);
	elements.loginForm.addEventListener("submit", handleAdminLogin);
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeModal();
			closeLoginModal();
			closeSidebar();
			if (state.fullscreenStage && !document.fullscreenElement) {
				exitFullscreenStage();
			}
		}
	});
	document.addEventListener("fullscreenchange", syncFullscreenStageState);
}

function apiUrl(path) {
	return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function hasAdminToken() {
	return Boolean(ADMIN_TOKEN);
}

function getAuthHeaders() {
	return hasAdminToken() ? { Authorization: `Bearer ${ADMIN_TOKEN}` } : {};
}

function setAdminToken(token) {
	ADMIN_TOKEN = token;
	localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
	updateAuthUi();
}

function clearAdminToken() {
	ADMIN_TOKEN = "";
	localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
	updateAuthUi();
}

function updateAuthUi() {
	const isAdmin = hasAdminToken();
	if (elements.authStatus) {
		elements.authStatus.textContent = isAdmin ? "Admin" : "Khách";
		elements.authStatus.classList.toggle("admin", isAdmin);
		elements.authStatus.classList.toggle("guest", !isAdmin);
	}
	if (elements.authButton) {
		elements.authButton.textContent = isAdmin ? "Đăng xuất" : "Đăng nhập admin";
		elements.authButton.title = isAdmin ? "Đăng xuất admin" : "Đăng nhập admin";
	}

	[elements.openSongForm, elements.adminActions].forEach((el) => {
		if (!el) return;
		el.classList.toggle("hidden", !isAdmin);
	});

	if (state.songs.length) {
		renderSongList(elements.search.value);
	}
}

async function validateAdminSession() {
	if (!hasAdminToken()) return;

	try {
		const response = await fetch(apiUrl("/api/v1/admin/me"), {
			headers: {
				...getAuthHeaders()
			}
		});
		if (response.status === 401) {
			clearAdminToken();
			return;
		}
		if (!response.ok) throw new Error(`API trả về ${response.status}`);
	} catch (error) {
		clearAdminToken();
	}
}

function handleAuthButtonClick() {
	if (hasAdminToken()) {
		logoutAdmin();
		return;
	}

	openLoginModal();
}

function logoutAdmin() {
	stopAutoScroll();
	clearAdminToken();
	state.pendingAction = null;
	setApiStatus("Đã đăng xuất", false);
	closeLoginModal();
}

function openLoginModal(message = "") {
	elements.loginMessage.textContent = message;
	elements.loginModal.classList.add("open");
	elements.loginModal.setAttribute("aria-hidden", "false");
	setTimeout(() => elements.loginForm.elements.password.focus(), 0);
}

function closeLoginModal() {
	elements.loginModal.classList.remove("open");
	elements.loginModal.setAttribute("aria-hidden", "true");
	if (elements.loginMessage) {
		elements.loginMessage.textContent = "";
	}
}

function openSongEntryForm() {
	if (!hasAdminToken()) {
		state.pendingAction = { type: "openSongForm" };
		openLoginModal("Đăng nhập admin để thêm bài hát.");
		return;
	}

	openModal();
}

async function handleAdminLogin(event) {
	event.preventDefault();
	const password = String(new FormData(elements.loginForm).get("password") || "").trim();
	if (!password) {
		elements.loginMessage.textContent = "Vui lòng nhập mật khẩu admin.";
		return;
	}

	elements.loginMessage.textContent = "Đang đăng nhập...";
	try {
		const response = await fetch(apiUrl("/api/v1/admin/login"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password })
		});
		if (!response.ok) {
			if (response.status === 401) {
				elements.loginMessage.textContent = "Sai mật khẩu admin.";
				return;
			}
			throw new Error(`API trả về ${response.status}`);
		}
		const payload = await response.json();
		setAdminToken(String(payload.token || ""));
		closeLoginModal();
		elements.loginForm.reset();
		const pendingAction = state.pendingAction;
		state.pendingAction = null;
		if (pendingAction?.type === "openSongForm") {
			openModal();
		}
		if (pendingAction?.type === "openEditSongForm") {
			openEditSongForm();
		}
		if (pendingAction?.type === "saveSong") {
			await performSaveSong(pendingAction.song, true);
		}
			if (pendingAction?.type === "updateSong") {
				await performUpdateSong(pendingAction.songId, pendingAction.song, true);
			}
		if (pendingAction?.type === "deleteSong") {
			await performDeleteSong(pendingAction.song, true);
		}
	} catch (error) {
		elements.loginMessage.textContent = `Không thể đăng nhập: ${error.message}`;
	}
}

async function loadSongs() {
	stopAutoScroll();
	try {
		const response = await fetch(apiUrl("/api/v1/songs"), { headers: { "Accept": "application/json" } });
		if (!response.ok) throw new Error(`API trả về ${response.status}`);
		const payload = await response.json();
		state.songs = normalizeSongList(payload);
		state.apiOnline = true;
		setApiStatus("Đã kết nối", false);
	} catch (error) {
		state.songs = loadLocalSongs();
		state.apiOnline = false;
		setApiStatus("Dữ liệu cục bộ", true);
	}

	renderSongList();
	if (state.songs.length) selectSong(state.songs[0].id);
}

function normalizeSongList(payload) {
	const songs = Array.isArray(payload) ? payload : payload.items || payload.data || [];
	return songs.map(normalizeSong).filter((song) => song.content);
}

function normalizeSong(song) {
	return {
		id: song.id ?? song.slug ?? `song-${Date.now()}-${Math.random()}`,
		title: song.title || song.name || "Chưa đặt tên",
		artist: song.artist || song.author || "Chưa rõ nghệ sĩ",
		key: song.key || song.original_key || getDirective(song.content || song.chordpro, "key") || "C",
		genre: song.genre || song.category || "",
		content: song.content || song.chordpro || song.body || ""
	};
}

function loadLocalSongs() {
	try {
		const saved = JSON.parse(localStorage.getItem("trung-beo-chords") || "[]");
		const deletedIds = JSON.parse(localStorage.getItem("trung-beo-deleted-songs") || "[]");
		return [...saved.map(normalizeSong), ...DEMO_SONGS].filter((song) => !deletedIds.includes(String(song.id)));
	} catch (error) {
		return [...DEMO_SONGS];
	}
}

function renderSongList(query = "") {
	const normalizedQuery = query.trim().toLocaleLowerCase("vi");
	const songs = state.songs.filter((song) =>
		`${song.title} ${song.artist}`.toLocaleLowerCase("vi").includes(normalizedQuery)
	);

	elements.songCount.textContent = `${songs.length} bài hát`;
	elements.songList.replaceChildren(...songs.map((song, index) => {
		const item = createElement("div", `song-list-item${state.activeSong?.id === song.id ? " active" : ""}`);
		const selectButton = document.createElement("button");
		selectButton.type = "button";
		selectButton.className = "song-select";
		selectButton.addEventListener("click", () => selectSong(song.id));

		const number = createElement("span", "song-index", String(index + 1).padStart(2, "0"));
		const copy = createElement("span");
		copy.append(
			createElement("span", "song-list-title", song.title),
			createElement("span", "song-list-artist", song.artist)
		);
		selectButton.append(number, copy, createElement("span", "song-list-key", song.key));

		item.append(selectButton);

		if (hasAdminToken()) {
			const deleteButton = document.createElement("button");
			deleteButton.type = "button";
			deleteButton.className = "song-delete";
			deleteButton.title = `Xóa ${song.title}`;
			deleteButton.setAttribute("aria-label", `Xóa ${song.title}`);
			deleteButton.innerHTML = '<i class="fa fa-trash"></i>';
			deleteButton.addEventListener("click", () => deleteSong(song));
			item.append(deleteButton);
		}

		return item;
	}));
}

function selectSong(id) {
	stopAutoScroll();
	state.activeSong = state.songs.find((song) => String(song.id) === String(id));
	state.transpose = 0;
	renderSongList(elements.search.value);
	renderActiveSong();
	closeSidebar();
}

function renderActiveSong() {
	const song = state.activeSong;
	if (!song) return;

	elements.title.textContent = song.title;
	elements.artist.textContent = song.artist;
	elements.tags.replaceChildren(
		...["ChordPro", song.genre, "Responsive"].filter(Boolean).map((tag) => createElement("span", "", tag))
	);
	renderChordSheet(song.content, state.transpose);
	updateTransposeDisplay();
}

async function deleteSong(song) {
	const confirmed = window.confirm(`Xóa "${song.title}" khỏi thư viện? Thao tác này không thể hoàn tác.`);
	if (!confirmed) return;

	if (!hasAdminToken()) {
		state.pendingAction = { type: "deleteSong", song };
		openLoginModal("Đăng nhập admin để xóa bài hát.");
		return;
	}

	await performDeleteSong(song);
}

async function performDeleteSong(song, fromPendingAction = false) {

	if (state.apiOnline) {
		try {
			const response = await fetch(`${apiUrl("/api/v1/songs")}/${encodeURIComponent(song.id)}`, {
				method: "DELETE",
				headers: {
					...getAuthHeaders()
				}
			});
			if (response.status === 401) {
				clearAdminToken();
				state.pendingAction = { type: "deleteSong", song };
				openLoginModal("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
				return;
			}
			if (!response.ok) throw new Error(`API trả về ${response.status}`);
		} catch (error) {
			if (fromPendingAction) {
				window.alert(`Không thể xóa bài hát: ${error.message}`);
				return;
			}
			window.alert(`Không thể xóa bài hát: ${error.message}`);
			return;
		}
	} else {
		removeLocalSong(song.id);
	}

	const deletedIndex = state.songs.findIndex((item) => String(item.id) === String(song.id));
	state.songs = state.songs.filter((item) => String(item.id) !== String(song.id));
	const wasActive = String(state.activeSong?.id) === String(song.id);

	if (wasActive) {
		const nextSong = state.songs[Math.min(deletedIndex, state.songs.length - 1)];
		if (nextSong) {
			selectSong(nextSong.id);
			return;
		}
		clearActiveSong();
	}

	renderSongList(elements.search.value);
}

function removeLocalSong(id) {
	const stringId = String(id);
	const savedSongs = JSON.parse(localStorage.getItem("trung-beo-chords") || "[]")
		.filter((song) => String(song.id) !== stringId);
	const deletedIds = new Set(JSON.parse(localStorage.getItem("trung-beo-deleted-songs") || "[]").map(String));
	deletedIds.add(stringId);
	localStorage.setItem("trung-beo-chords", JSON.stringify(savedSongs));
	localStorage.setItem("trung-beo-deleted-songs", JSON.stringify([...deletedIds]));
}

function clearActiveSong() {
	stopAutoScroll();
	state.activeSong = null;
	state.transpose = 0;
	elements.title.textContent = "Thư viện đang trống";
	elements.artist.textContent = "Thêm một bài hát ChordPro để bắt đầu.";
	elements.tags.replaceChildren();
	elements.key.textContent = "--";
	elements.transposeValue.textContent = "Nguyên bản";
	const emptyState = createElement("div", "empty-state");
	emptyState.append(
		createElement("i", "fa fa-music"),
		createElement("p", "", "Chưa có bài hát trong thư viện.")
	);
	elements.sheet.replaceChildren(emptyState);
	renderSongList(elements.search.value);
}

function renderChordSheet(source, steps) {
	stopAutoScroll();
	const fragment = document.createDocumentFragment();
	const parsedSource = parseWithChordSheetJs(source);

	parsedSource.split(/\r?\n/).forEach((rawLine) => {
		const line = rawLine.trimEnd();
		const directive = line.match(/^\{([^}:]+)(?::\s*(.*))?\}$/);

		if (directive) {
			const name = directive[1].trim().toLowerCase();
			const value = (directive[2] || "").trim();
			if (["start_of_verse", "start_of_chorus", "start_of_bridge", "start_of_tab", "comment", "c", "soc", "sov", "sob"].includes(name)) {
				fragment.append(createElement("h3", "song-section", value || sectionName(name)));
			}
			return;
		}

		if (!line.trim()) {
			fragment.append(createElement("div", "plain-line", "\u00a0"));
			return;
		}

		fragment.append(renderChordLine(line, steps));
	});

	elements.sheet.replaceChildren(fragment);
}

function parseWithChordSheetJs(source) {
	// ChordSheetJS validates and normalizes ChordPro where its browser bundle is available.
	try {
		if (!window.ChordSheetJS?.ChordProParser || !window.ChordSheetJS?.ChordProFormatter) return source;
		const song = new window.ChordSheetJS.ChordProParser().parse(source);
		return new window.ChordSheetJS.ChordProFormatter().format(song);
	} catch (error) {
		return source;
	}
}

function renderChordLine(line, steps) {
	const wrapper = createElement("div", line.includes("[") ? "chord-line" : "plain-line");
	if (!line.includes("[")) {
		wrapper.textContent = line;
		return wrapper;
	}

	const pattern = /\[([^\]]+)\]([^\[]*)/g;
	const firstChord = line.indexOf("[");
	if (firstChord > 0) wrapper.append(createPair("", line.slice(0, firstChord)));

	let match;
	while ((match = pattern.exec(line)) !== null) {
		wrapper.append(createPair(transposeChord(match[1], steps), match[2] || " "));
	}
	return wrapper;
}

function createPair(chord, lyric) {
	const pair = createElement("span", "chord-pair");
	pair.append(
		createElement("span", "chord-name", chord || "\u00a0"),
		createElement("span", "lyric-text", lyric || "\u00a0")
	);
	return pair;
}

function transposeChord(chord, steps) {
	return chord.replace(/(^|\/)([A-G](?:#|b)?)/g, (match, prefix, note) => {
		if (!(note in NOTE_INDEX)) return match;
		return prefix + NOTES_SHARP[mod(NOTE_INDEX[note] + steps, 12)];
	});
}

function transposeKey(key, steps) {
	const match = key.match(/^([A-G](?:#|b)?)(.*)$/);
	if (!match || !(match[1] in NOTE_INDEX)) return key;
	return NOTES_SHARP[mod(NOTE_INDEX[match[1]] + steps, 12)] + match[2];
}

function changeTranspose(amount) {
	if (!state.activeSong) return;
	setTranspose(state.transpose + amount);
}

function setTranspose(value) {
	if (!state.activeSong) return;
	state.transpose = Math.max(-11, Math.min(11, value));
	renderChordSheet(state.activeSong.content, state.transpose);
	updateTransposeDisplay();
}

function applyStoredStageSettings() {
	applyFontSize();
	updateAutoScrollButton();
	updateScrollSpeedDisplay();
}

function changeFontSize(amount) {
	state.fontSize = clamp(state.fontSize + amount, FONT_SIZE_MIN, FONT_SIZE_MAX);
	localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(state.fontSize));
	applyFontSize();
}

function applyFontSize() {
	elements.sheet.style.fontSize = `${state.fontSize}px`;
	elements.fontSizeValue.textContent = `${state.fontSize}px`;
	elements.fontDecrease.disabled = state.fontSize <= FONT_SIZE_MIN;
	elements.fontIncrease.disabled = state.fontSize >= FONT_SIZE_MAX;
}

function toggleAutoScroll() {
	if (state.autoScrollActive) {
		stopAutoScroll();
		return;
	}
	startAutoScroll();
}

function startAutoScroll() {
	if (!state.activeSong || state.autoScrollActive) return;
	state.autoScrollActive = true;
	state.lastScrollFrameTime = null;
	updateAutoScrollButton();
	state.autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
}

function stopAutoScroll() {
	if (state.autoScrollFrame) {
		window.cancelAnimationFrame(state.autoScrollFrame);
	}
	state.autoScrollActive = false;
	state.autoScrollFrame = null;
	state.lastScrollFrameTime = null;
	updateAutoScrollButton();
}

function stepAutoScroll(timestamp) {
	if (!state.autoScrollActive) return;

	const scroller = document.scrollingElement || document.documentElement;
	const maxScroll = scroller.scrollHeight - window.innerHeight;
	if (window.scrollY >= maxScroll - 2) {
		stopAutoScroll();
		return;
	}

	if (state.lastScrollFrameTime === null) {
		state.lastScrollFrameTime = timestamp;
	}
	const elapsed = timestamp - state.lastScrollFrameTime;
	state.lastScrollFrameTime = timestamp;
	const pixelsPerSecond = state.scrollSpeed * 8;
	window.scrollBy(0, pixelsPerSecond * (elapsed / 1000));
	state.autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
}

function updateAutoScrollButton() {
	if (!elements.autoScrollToggle) return;
	elements.autoScrollToggle.classList.toggle("active", state.autoScrollActive);
	elements.autoScrollToggle.title = state.autoScrollActive ? "Dừng tự động cuộn" : "Bật tự động cuộn";
	elements.autoScrollToggle.innerHTML = state.autoScrollActive
		? '<i class="fa fa-pause"></i> Stop Scroll'
		: '<i class="fa fa-play"></i> Auto Scroll';
}

function handleScrollSpeedChange(event) {
	state.scrollSpeed = clamp(Number(event.target.value) || 4, 1, 10);
	localStorage.setItem(SCROLL_SPEED_STORAGE_KEY, String(state.scrollSpeed));
	updateScrollSpeedDisplay();
}

function updateScrollSpeedDisplay() {
	elements.scrollSpeed.value = String(state.scrollSpeed);
	elements.scrollSpeedValue.textContent = String(state.scrollSpeed);
}

function scrollToSongTop() {
	stopAutoScroll();
	const top = elements.sheet.getBoundingClientRect().top + window.scrollY - 90;
	window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

async function toggleFullscreenStage() {
	if (state.fullscreenStage || document.fullscreenElement) {
		await exitFullscreenStage();
		return;
	}
	await enterFullscreenStage();
}

async function enterFullscreenStage() {
	state.fullscreenStage = true;
	document.body.classList.add("fullscreen-stage");
	updateFullscreenButton();
	closeSidebar();

	if (document.documentElement.requestFullscreen) {
		try {
			await document.documentElement.requestFullscreen();
		} catch (error) {
			// CSS fullscreen-stage vẫn là fallback khi browser chặn Fullscreen API.
		}
	}
}

async function exitFullscreenStage() {
	state.fullscreenStage = false;
	document.body.classList.remove("fullscreen-stage");
	updateFullscreenButton();

	if (document.fullscreenElement && document.exitFullscreen) {
		try {
			await document.exitFullscreen();
		} catch (error) {
			// Không cần chặn UI nếu browser tự xử lý thoát fullscreen.
		}
	}
}

function syncFullscreenStageState() {
	if (document.fullscreenElement) return;
	state.fullscreenStage = false;
	document.body.classList.remove("fullscreen-stage");
	updateFullscreenButton();
}

function updateFullscreenButton() {
	if (!elements.fullscreenToggle) return;
	elements.fullscreenToggle.classList.toggle("active", state.fullscreenStage);
	elements.fullscreenToggle.title = state.fullscreenStage ? "Thoát Fullscreen Stage" : "Fullscreen Stage";
	elements.fullscreenToggle.innerHTML = state.fullscreenStage
		? '<i class="fa fa-compress"></i> Exit Fullscreen'
		: '<i class="fa fa-expand"></i> Fullscreen';
}

function updateTransposeDisplay() {
	const song = state.activeSong;
	if (!song) return;
	elements.key.textContent = transposeKey(song.key, state.transpose);
	elements.transposeValue.textContent = state.transpose === 0
		? "Nguyên bản"
		: `${state.transpose > 0 ? "+" : ""}${state.transpose}`;
}

async function saveSong(event) {
	event.preventDefault();
	const formData = new FormData(elements.form);
	const song = normalizeSong(Object.fromEntries(formData.entries()));
	if (!state.editingSongId) {
		song.id = `local-${Date.now()}`;
	}
	if (!hasAdminToken()) {
		state.pendingAction = state.editingSongId
			? { type: "updateSong", songId: state.editingSongId, song }
			: { type: "saveSong", song };
		openLoginModal("Đăng nhập admin để lưu bài hát.");
		return;
	}

	if (state.editingSongId) {
		await performUpdateSong(state.editingSongId, song);
		return;
	}

	await performSaveSong(song);
}

async function performUpdateSong(songId, song, fromPendingAction = false) {
	elements.formMessage.textContent = "Đang cập nhật...";

	try {
		const response = await fetch(`${apiUrl("/api/v1/songs")}/${encodeURIComponent(songId)}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				...getAuthHeaders()
			},
			body: JSON.stringify(song)
		});
		if (response.status === 401) {
			clearAdminToken();
			state.pendingAction = { type: "updateSong", songId, song };
			openLoginModal("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
			return;
		}
		if (!response.ok) throw new Error(`API trả về ${response.status}`);
		const updatedSong = normalizeSong(await response.json());
		state.songs = state.songs.map((item) => String(item.id) === String(songId) ? updatedSong : item);
		state.apiOnline = true;
		setApiStatus("Đã kết nối", false);
		elements.form.reset();
		closeModal();
		renderSongList(elements.search.value);
		selectSong(updatedSong.id);
	} catch (error) {
		if (fromPendingAction) {
			elements.formMessage.textContent = `Không thể cập nhật bài hát: ${error.message}`;
			return;
		}
		elements.formMessage.textContent = `Không thể cập nhật bài hát: ${error.message}`;
	}
}

async function performSaveSong(song, fromPendingAction = false) {
	elements.formMessage.textContent = "Đang lưu...";

	try {
		const response = await fetch(apiUrl("/api/v1/songs"), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getAuthHeaders()
			},
			body: JSON.stringify(song)
		});
		if (response.status === 401) {
			clearAdminToken();
			state.pendingAction = { type: "saveSong", song };
			openLoginModal("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
			return;
		}
		if (!response.ok) throw new Error(`API trả về ${response.status}`);
		const savedSong = normalizeSong(await response.json());
		state.songs.unshift(savedSong);
		state.apiOnline = true;
		setApiStatus("Đã kết nối", false);
	} catch (error) {
		if (fromPendingAction) {
			elements.formMessage.textContent = `Không thể lưu bài hát: ${error.message}`;
			return;
		}
		const localSongs = JSON.parse(localStorage.getItem("trung-beo-chords") || "[]");
		localSongs.unshift(song);
		localStorage.setItem("trung-beo-chords", JSON.stringify(localSongs));
		state.songs.unshift(song);
		setApiStatus("Đã lưu cục bộ", true);
	}

	elements.form.reset();
	closeModal();
	renderSongList();
	selectSong(state.songs[0].id);
}

function openModal() {
	elements.modal.classList.add("open");
	elements.modal.setAttribute("aria-hidden", "false");
	elements.formMessage.textContent = "";
	setTimeout(() => elements.form.elements.title.focus(), 0);
}

function openEditSongForm() {
	const song = state.activeSong;
	if (!song) {
		window.alert("Hãy chọn một bài hát để sửa.");
		return;
	}
	if (!hasAdminToken()) {
		state.pendingAction = { type: "openEditSongForm" };
		openLoginModal("Đăng nhập admin để sửa bài hát.");
		return;
	}

	state.editingSongId = song.id;
	elements.modalEyebrow.textContent = "Chỉnh sửa";
	document.querySelector("#formTitle").textContent = "Sửa nội dung ChordPro";
	elements.form.elements.title.value = song.title || "";
	elements.form.elements.artist.value = song.artist || "";
	elements.form.elements.key.value = song.key || "";
	elements.form.elements.genre.value = song.genre || "";
	elements.form.elements.content.value = song.content || "";
	openModal();
}

function deleteActiveSong() {
	if (!state.activeSong) {
		window.alert("Hãy chọn một bài hát để xóa.");
		return;
	}
	deleteSong(state.activeSong);
}

function closeModal() {
	elements.modal.classList.remove("open");
	elements.modal.setAttribute("aria-hidden", "true");
	state.editingSongId = null;
	elements.modalEyebrow.textContent = "Bài hát mới";
	document.querySelector("#formTitle").textContent = "Dán nội dung ChordPro";
}

function openSidebar() {
	elements.sidebar.classList.add("open");
	elements.sidebarBackdrop.classList.add("open");
}

function closeSidebar() {
	elements.sidebar.classList.remove("open");
	elements.sidebarBackdrop.classList.remove("open");
}

function setApiStatus(text, offline) {
	elements.apiStatus.textContent = text;
	elements.apiStatus.classList.toggle("offline", offline);
}

function getDirective(source = "", name) {
	const match = source.match(new RegExp(`\\{${name}:\\s*([^}]+)\\}`, "i"));
	return match ? match[1].trim() : "";
}

function sectionName(name) {
	if (["start_of_chorus", "soc"].includes(name)) return "Điệp khúc";
	if (["start_of_bridge", "sob"].includes(name)) return "Chuyển đoạn";
	if (["start_of_tab"].includes(name)) return "Tab";
	return "Lời";
}

function createElement(tag, className = "", text = "") {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text) element.textContent = text;
	return element;
}

function readStoredNumber(key, fallback, min, max) {
	const value = Number(localStorage.getItem(key));
	return clamp(Number.isFinite(value) ? value : fallback, min, max);
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function mod(value, divisor) {
	return ((value % divisor) + divisor) % divisor;
}
