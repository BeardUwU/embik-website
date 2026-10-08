const databaseName = "frame-lab";
const databaseVersion = 1;

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, databaseVersion);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains("projects")) {
                database.createObjectStore("projects", { keyPath: "id" });
            }
            if (!database.objectStoreNames.contains("gear")) {
                database.createObjectStore("gear", { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function storeRecord(storeName, record) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).put(record);
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
        transaction.onabort = () => {
            database.close();
            reject(transaction.error);
        };
    });
}

async function getRecords(storeName) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
    });
}

async function deleteRecord(storeName, id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).delete(id);
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
    });
}

function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
}

function youtubeUrlIsValid(value) {
    try {
        const url = new URL(value);
        return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(url.hostname);
    } catch {
        return false;
    }
}

function renderProject(project) {
    const card = makeElement("article", "project-card");
    card.dataset.category = project.category;
    card.dataset.search = `${project.title} ${project.description}`.toLocaleLowerCase("hu");
    const cover = makeElement("a", "project-cover cover-city");
    cover.href = project.videoUrl;
    cover.target = "_blank";
    cover.rel = "noopener noreferrer";
    cover.setAttribute("aria-label", `${project.title} megnyitása YouTube-on`);
    if (project.image) {
        cover.style.backgroundImage = `linear-gradient(0deg, rgb(8 11 10 / 72%), transparent 60%), url("${URL.createObjectURL(project.image)}")`;
        cover.style.backgroundPosition = "center";
        cover.style.backgroundSize = "cover";
    }
    const kicker = makeElement("span", "cover-kicker", `${project.categoryLabel.toLocaleUpperCase("hu")} · SAJÁT`);
    const title = makeElement("span", "cover-title", project.title);
    const play = makeElement("span", "play-button", "▶");
    play.setAttribute("aria-hidden", "true");
    cover.append(kicker, title, play);
    const info = makeElement("div", "project-info");
    const details = makeElement("div");
    details.append(makeElement("h3", "", project.title), makeElement("p", "", project.description));
    info.append(details, makeElement("span", "project-number", "ÚJ"));
    card.append(cover, info);
    return card;
}

function renderGear(item) {
    const card = makeElement("article", "gear-card");
    card.append(
        makeElement("span", "gear-icon", "✳"),
        makeElement("p", "gear-type", `${item.category.toLocaleUpperCase("hu")} · SAJÁT`),
        makeElement("h3", "", item.name),
        makeElement("p", "", item.description)
    );
    return card;
}

async function refreshHome() {
    const projectGrid = document.querySelector("#project-grid");
    const gearGrid = document.querySelector("#gear-grid");
    try {
        const [projects, gear] = await Promise.all([
            projectGrid ? getRecords("projects") : [],
            gearGrid ? getRecords("gear") : []
        ]);
        projects.forEach((project) => projectGrid.prepend(renderProject(project)));
        gear.forEach((item) => gearGrid.prepend(renderGear(item)));
    } catch (error) {
        console.error("A mentett beküldések betöltése nem sikerült.", error);
    }
}

function setupProjectFilters() {
    const search = document.querySelector("#project-search");
    const grid = document.querySelector("#project-grid");
    const empty = document.querySelector("#project-empty");
    if (!search || !grid || !empty) return;
    let category = "all";
    const update = () => {
        const query = search.value.trim().toLocaleLowerCase("hu");
        let visibleCount = 0;
        grid.querySelectorAll(".project-card").forEach((card) => {
            const matchesCategory = category === "all" || (card.dataset.category || "").split(/\s+/).includes(category);
            const matchesQuery = (card.dataset.search || "").toLocaleLowerCase("hu").includes(query);
            card.hidden = !(matchesCategory && matchesQuery);
            if (!card.hidden) visibleCount += 1;
        });
        empty.hidden = visibleCount > 0;
    };
    search.addEventListener("input", update);
    document.querySelectorAll(".filter-button").forEach((button) => {
        button.addEventListener("click", () => {
            category = button.dataset.filter;
            document.querySelectorAll(".filter-button").forEach((item) => {
                const active = item === button;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-pressed", String(active));
            });
            update();
        });
    });
}

function setupProjectForm() {
    const form = document.querySelector("#project-form");
    if (!form) return;
    const status = document.querySelector("#project-status");
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const videoUrl = data.get("videoUrl").trim();
        const image = data.get("image");
        if (!youtubeUrlIsValid(videoUrl)) {
            setStatus(status, "Adj meg érvényes YouTube- vagy youtu.be-videólinket.", true);
            return;
        }
        if (image.size > 5 * 1024 * 1024) {
            setStatus(status, "A borítókép legfeljebb 5 MB lehet.", true);
            return;
        }
        if (image.size && !["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
            setStatus(status, "A borítókép JPG, PNG vagy WebP formátumú lehet.", true);
            return;
        }
        const categoryLabels = { vlog: "Vlog / utazás", tura: "Túra / kirándulás", gaming: "Gaming" };
        const project = {
            id: crypto.randomUUID(),
            title: data.get("title").trim(),
            category: data.get("category"),
            categoryLabel: categoryLabels[data.get("category")],
            description: data.get("description").trim(),
            videoUrl,
            image: image.size ? image : null
        };
        try {
            await storeRecord("projects", project);
            form.reset();
            setStatus(status, "A projekt elmentve ezen az eszközön.");
            await renderSavedEntries();
        } catch (error) {
            console.error("A projekt mentése nem sikerült.", error);
            setStatus(status, "A mentés nem sikerült. Ellenőrizd a böngésző tárhelyét, majd próbáld újra.", true);
        }
    });
}

function setupGearForm() {
    const form = document.querySelector("#gear-form");
    if (!form) return;
    const status = document.querySelector("#gear-status");
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        try {
            await storeRecord("gear", {
                id: crypto.randomUUID(),
                name: data.get("name").trim(),
                category: data.get("category"),
                description: data.get("description").trim()
            });
            form.reset();
            setStatus(status, "A felszerelés elmentve ezen az eszközön.");
            await renderSavedEntries();
        } catch (error) {
            console.error("A felszerelés mentése nem sikerült.", error);
            setStatus(status, "A mentés nem sikerült. Ellenőrizd a böngésző tárhelyét, majd próbáld újra.", true);
        }
    });
}

async function renderSavedEntries() {
    const list = document.querySelector("#saved-list");
    if (!list) return;
    try {
        const [projects, gear] = await Promise.all([getRecords("projects"), getRecords("gear")]);
        list.replaceChildren();
        const entries = [
            ...projects.map((item) => ({ ...item, type: "projects", kind: "Projekt" })),
            ...gear.map((item) => ({ ...item, type: "gear", kind: "Felszerelés" }))
        ];
        if (!entries.length) {
            list.append(makeElement("p", "saved-empty", "Még nincs saját projekted vagy felszerelésed."));
            return;
        }
        entries.reverse().forEach((entry) => {
            const row = makeElement("article", "saved-entry");
            const info = makeElement("div");
            info.append(makeElement("h3", "", entry.name || entry.title), makeElement("p", "", `${entry.kind} · ${entry.categoryLabel || entry.category}`));
            const remove = makeElement("button", "delete-button", "Törlés");
            remove.type = "button";
            remove.setAttribute("aria-label", `${entry.name || entry.title} törlése`);
            remove.addEventListener("click", async () => {
                try {
                    await deleteRecord(entry.type, entry.id);
                    await renderSavedEntries();
                } catch (error) {
                    console.error("A beküldés törlése nem sikerült.", error);
                    const statusId = entry.type === "projects" ? "#project-status" : "#gear-status";
                    setStatus(document.querySelector(statusId), "A törlés nem sikerült. Próbáld újra.", true);
                }
            });
            row.append(info, remove);
            list.append(row);
        });
    } catch (error) {
        console.error("A saját beküldések betöltése nem sikerült.", error);
        list.replaceChildren(makeElement("p", "saved-empty", "A saját beküldések betöltése nem sikerült."));
    }
}

function setupMobileNavigation() {
    const button = document.querySelector(".menu-toggle");
    const navigation = document.querySelector("#main-nav");
    if (!button || !navigation) return;
    button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        navigation.classList.toggle("is-open", !expanded);
    });
    navigation.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            button.setAttribute("aria-expanded", "false");
            navigation.classList.remove("is-open");
        });
    });
}

function setupRouteMap() {
    const setActive = (stopId, isActive) => {
        document.querySelectorAll(`[data-route-stop="${stopId}"], [data-map-stop="${stopId}"]`).forEach((element) => {
            element.classList.toggle("is-active", isActive);
        });
    };
    const bindStop = (element, attributeName) => {
        const stopId = element.dataset[attributeName];
        if (!stopId) return;
        element.addEventListener("pointerenter", () => setActive(stopId, true));
        element.addEventListener("pointerleave", () => setActive(stopId, false));
        const focusTarget = element.querySelector("a, button, input, select, textarea, [tabindex]") || element;
        focusTarget?.addEventListener("focus", () => setActive(stopId, true));
        focusTarget?.addEventListener("blur", () => setActive(stopId, false));
    };

    document.querySelectorAll("[data-route-stop]").forEach((element) => bindStop(element, "routeStop"));
    document.querySelectorAll("[data-map-stop]").forEach((element) => bindStop(element, "mapStop"));
}

function setupAlbumViewer() {
    const dialog = document.querySelector(".album-viewer");
    const viewerImage = dialog?.querySelector(".album-viewer-image");
    const closeButton = dialog?.querySelector(".album-viewer-close");
    const previousButton = dialog?.querySelector(".album-viewer-prev");
    const nextButton = dialog?.querySelector(".album-viewer-next");
    const count = dialog?.querySelector(".album-viewer-count");
    if (
        !(dialog instanceof HTMLDialogElement) ||
        !(viewerImage instanceof HTMLImageElement) ||
        !(closeButton instanceof HTMLButtonElement) ||
        !(previousButton instanceof HTMLButtonElement) ||
        !(nextButton instanceof HTMLButtonElement) ||
        !(count instanceof HTMLElement)
    ) return;

    const photos = [...document.querySelectorAll(".album-photo-button")];
    let activeIndex = 0;
    const showPhoto = (index) => {
        activeIndex = (index + photos.length) % photos.length;
        const button = photos[activeIndex];
        const image = button.querySelector("img");
        const fullImage = button.dataset.fullImage;
        if (!(image instanceof HTMLImageElement) || !fullImage) return;
        viewerImage.src = fullImage;
        viewerImage.alt = image.alt;
        count.textContent = `${activeIndex + 1} / ${photos.length}`;
    };

    photos.forEach((button, index) => {
        button.addEventListener("click", () => {
            showPhoto(index);
            dialog.showModal();
        });
    });

    previousButton.addEventListener("click", () => showPhoto(activeIndex - 1));
    nextButton.addEventListener("click", () => showPhoto(activeIndex + 1));
    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") showPhoto(activeIndex - 1);
        if (event.key === "ArrowRight") showPhoto(activeIndex + 1);
    });
    dialog.addEventListener("close", () => {
        viewerImage.removeAttribute("src");
        viewerImage.alt = "";
        count.textContent = "";
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const year = document.querySelector("#current-year");
    if (year) year.textContent = String(new Date().getFullYear());
    setupMobileNavigation();
    setupRouteMap();
    setupProjectFilters();
    setupProjectForm();
    setupGearForm();
    setupAlbumViewer();
    void refreshHome();
    void renderSavedEntries();
});
