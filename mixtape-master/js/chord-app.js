"use strict";

// Ưu tiên đọc cấu hình runtime từ Vercel env qua /api/config.
const RUNTIME_CONFIG_ENDPOINT = "/api/config";
const _cfg = window.CHORD_CONFIG || {};
let API_URL = (_cfg.apiBaseUrl || "").replace(/\/$/, "") + "/api/v1/songs";
let API_SECRET = _cfg.secretKey || "";
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
	apiOnline: false
};

const elements = {
	songList: document.querySelector("#songList"),
	songCount: document.querySelector("#songCount"),
	apiStatus: document.querySelector("#apiStatus"),
	search: document.querySelector("#songSearch"),
	title: document.querySelector("#songTitle"),
	artist: document.querySelector("#songArtist"),
	tags: document.querySelector("#songTags"),
	key: document.querySelector("#currentKey"),
	transposeValue: document.querySelector("#transposeValue"),
	sheet: document.querySelector("#chordSheet"),
	modal: document.querySelector("#songModal"),
	form: document.querySelector("#songForm"),
	formMessage: document.querySelector("#formMessage"),
	sidebar: document.querySelector("#sidebar"),
	sidebarBackdrop: document.querySelector("#sidebarBackdrop")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
	await loadRuntimeConfig();
	bindEvents();
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
			API_URL = String(runtime.apiBaseUrl).replace(/\/$/, "") + "/api/v1/songs";
		}
		if (runtime.secretKey) {
			API_SECRET = String(runtime.secretKey);
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
	document.querySelector("#openSongForm").addEventListener("click", openModal);
	document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));
	document.querySelector("#sidebarToggle").addEventListener("click", openSidebar);
	document.querySelector("#closeSidebar").addEventListener("click", closeSidebar);
	elements.sidebarBackdrop.addEventListener("click", closeSidebar);
	elements.form.addEventListener("submit", saveSong);
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeModal();
			closeSidebar();
		}
	});
}

async function loadSongs() {
	try {
		const response = await fetch(API_URL, { headers: { "Accept": "application/json" } });
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

		const deleteButton = document.createElement("button");
		deleteButton.type = "button";
		deleteButton.className = "song-delete";
		deleteButton.title = `Xóa ${song.title}`;
		deleteButton.setAttribute("aria-label", `Xóa ${song.title}`);
		deleteButton.innerHTML = '<i class="fa fa-trash"></i>';
		deleteButton.addEventListener("click", () => deleteSong(song));

		item.append(selectButton, deleteButton);
		return item;
	}));
}

function selectSong(id) {
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

	if (state.apiOnline) {
		try {
			const response = await fetch(`${API_URL}/${encodeURIComponent(song.id)}`, {
				method: "DELETE",
				headers: API_SECRET ? { "X-Secret-Key": API_SECRET } : {}
			});
			if (!response.ok) throw new Error(`API trả về ${response.status}`);
		} catch (error) {
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
	state.transpose = Math.max(-11, Math.min(11, value));
	renderChordSheet(state.activeSong.content, state.transpose);
	updateTransposeDisplay();
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
	song.id = `local-${Date.now()}`;
	elements.formMessage.textContent = "Đang lưu...";

	try {
		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(API_SECRET ? { "X-Secret-Key": API_SECRET } : {})
			},
			body: JSON.stringify(song)
		});
		if (!response.ok) throw new Error(`API trả về ${response.status}`);
		const savedSong = normalizeSong(await response.json());
		state.songs.unshift(savedSong);
		state.apiOnline = true;
		setApiStatus("Đã kết nối", false);
	} catch (error) {
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

function closeModal() {
	elements.modal.classList.remove("open");
	elements.modal.setAttribute("aria-hidden", "true");
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

function mod(value, divisor) {
	return ((value % divisor) + divisor) % divisor;
}
