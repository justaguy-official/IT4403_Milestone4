/*
 * IT 4403 - Individual Project Milestone 4
 * Continuation of David Tarver's Milestone 3 Open Library SPA.
 * All requests use jQuery AJAX; all book cards and details use Mustache.js.
 * No PHP, React, Vue, Angular, Bootstrap, or additional JS frameworks.
 */
$(function () {
  "use strict";

  const API = "https://openlibrary.org";
  const SUBJECT = "science_fiction"; // Same predefined collection as Milestone 3.
  const SEARCH_LIMIT = 50;
  const PAGE_SIZE = 10;

  const state = {
    query: "",
    books: [],
    reportedTotal: 0,
    currentPage: 1,
    isSearching: false,
    searchVersion: 0,
    collection: [],
    activeTab: "search",
    layouts: { search: "grid", collection: "grid" },
    selectedWorkId: "",
    detailVersion: 0,
    detailCache: new Map(),
    authorCache: new Map()
  };

  function cleanText(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function workId(value) {
    const match = typeof value === "string" ? value.match(/(?:^|\/)\b(OL\d+W)$/) : null;
    return match ? match[1] : "";
  }

  function validCoverId(value) {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  }

  function getCoverUrl(cover, size) {
    return cover ? "https://covers.openlibrary.org/b/id/" + cover + "-" + size + ".jpg?default=false" : "";
  }

  function authorList(raw) {
    if (Array.isArray(raw.author_name)) {
      return raw.author_name.filter(x => typeof x === "string" && x.trim()).slice(0, 5);
    }
    if (Array.isArray(raw.authors)) {
      return raw.authors.map(x => x && x.name).filter(x => typeof x === "string" && x.trim()).slice(0, 5);
    }
    return [];
  }

  function languageNames(raw) {
    const known = { eng: "English", fre: "French", fra: "French", spa: "Spanish", ger: "German", deu: "German", ita: "Italian", por: "Portuguese", jpn: "Japanese", rus: "Russian", chi: "Chinese", zho: "Chinese" };
    const entries = Array.isArray(raw) ? raw : [];
    const names = entries.map(item => {
      let code = typeof item === "string" ? item : item && item.key;
      if (!code) return "";
      code = code.split("/").pop().toLowerCase();
      return known[code] || (code.length === 3 ? code.toUpperCase() : "");
    }).filter(Boolean);
    return [...new Set(names)].slice(0, 3).join(", ") || "Not available";
  }

  function normalizeBook(raw) {
    raw = raw || {};
    const cover = validCoverId(raw.cover_i || raw.cover_id || (Array.isArray(raw.covers) ? raw.covers[0] : 0));
    const id = workId(raw.key);
    const year = Number(raw.first_publish_year);
    return {
      id: id,
      title: cleanText(raw.title, "Untitled book"),
      cover: cover,
      authors: authorList(raw),
      year: Number.isInteger(year) && year > 0 && year < 3000 ? year : null,
      languages: Array.isArray(raw.language) ? raw.language : [],
      editions: Number.isInteger(Number(raw.edition_count)) ? Number(raw.edition_count) : null
    };
  }

  function templateBook(book) {
    return {
      id: book.id,
      idLabel: book.id ? "Work ID: " + book.id : "Work ID unavailable",
      canSelect: Boolean(book.id),
      title: book.title,
      hasCover: Boolean(book.cover),
      coverUrl: getCoverUrl(book.cover, "M"),
      authorText: book.authors.length ? book.authors.join(", ") : "Author unavailable",
      publicationText: book.year ? "First published " + book.year : "Publication year unavailable",
      selected: Boolean(book.id && book.id === state.selectedWorkId)
    };
  }

  function showMessage(id, message, type) {
    $(id).removeClass("error success").addClass(type || "").text(message).prop("hidden", false);
  }

  function hideMessage(id) {
    $(id).prop("hidden", true);
  }

  function emptyState(title, body, loading) {
    return $('<div class="empty-state">')
      .toggleClass("loading-state", Boolean(loading))
      .append($("<strong>").text(title), $("<p>").text(body));
  }

  function loadingDetails(title) {
    return $('<div class="details-empty loading-state">')
      .append($("<strong>").text("Loading book details"), $("<p>").text("Retrieving " + title + " from Open Library…"));
  }

  // An unknown or broken cover still has meaningful content rather than a broken image.
  function attachCoverFallback($region) {
    $region.find(".book-cover img, .detail-cover img").on("error", function () {
      $(this).parent().empty().append($('<span class="no-cover">').text("Cover not available"));
    });
  }

  function renderBooks(scope) {
    const collection = scope === "collection";
    const books = collection ? state.collection : state.books.slice((state.currentPage - 1) * PAGE_SIZE, state.currentPage * PAGE_SIZE);
    const $target = collection ? $("#collectionResults") : $("#searchResults");
    const template = collection ? $("#collectionBookTemplate").html() : $("#searchBookTemplate").html();
    if (!books.length) return;
    // Mustache escapes all book fields before they are placed in the HTML.
    $target.html(Mustache.render(template, { books: books.map(templateBook) }));
    attachCoverFallback($target);
    updateSelectedCards();
  }

  function updateSelectedCards() {
    $(".book-pick").each(function () {
      const selected = Boolean(state.selectedWorkId && $(this).attr("data-work-id") === state.selectedWorkId);
      $(this).closest(".book-card").toggleClass("is-selected", selected);
      $(this).attr("aria-pressed", String(selected));
    });
  }

  function renderPagination() {
    const count = Math.ceil(state.books.length / PAGE_SIZE);
    const $nav = $("#paginationRegion");
    const $buttons = $("#pageButtons").empty();
    $nav.prop("hidden", count < 1);
    if (!count) return;
    for (let page = 1; page <= count; page++) {
      const $button = $("<button>", { type: "button", text: page, "aria-label": "Page " + page })
        .attr("data-page", page);
      if (page === state.currentPage) $button.addClass("active-page").attr("aria-current", "page");
      $buttons.append($button);
    }
    $("#previousPage").prop("disabled", state.currentPage === 1);
    $("#nextPage").prop("disabled", state.currentPage === count);
    $("#pageIndicator").text("Page " + state.currentPage + " of " + count);
  }

  function showSearchPage(page) {
    const pages = Math.ceil(state.books.length / PAGE_SIZE);
    if (!Number.isInteger(page) || page < 1 || page > pages) return;
    state.currentPage = page;
    renderBooks("search");
    renderPagination();
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, state.books.length);
    const capNote = state.reportedTotal > SEARCH_LIMIT ? " (first 50 accessible)" : "";
    $("#resultSummary").text("Showing " + start + "–" + end + " of " + state.books.length + capNote + ' for "' + state.query + '".');
  }

  function setSearching(isSearching) {
    state.isSearching = isSearching;
    $("#searchButton").prop("disabled", isSearching).text(isSearching ? "Searching…" : "Search →");
    $("#searchInput").prop("disabled", isSearching);
    $("#searchResults").attr("aria-busy", String(isSearching));
  }

  function runSearch(query) {
    const requestToken = ++state.searchVersion;
    state.query = query;
    state.currentPage = 1;
    state.books = [];
    state.reportedTotal = 0;
    setSearching(true);
    hideMessage("#searchStatus");
    $("#pageIndicator").empty();
    $("#paginationRegion").prop("hidden", true);
    $("#resultSummary").text("Searching for " + query + "…");
    $("#searchResults").empty().append(emptyState("Searching the catalog", "Contacting the Open Library Search API…", true));

    $.ajax({
      url: API + "/search.json",
      method: "GET",
      dataType: "json",
      data: { q: query, limit: SEARCH_LIMIT, fields: "key,title,author_name,cover_i,first_publish_year,language,edition_count" },
      timeout: 20000
    }).done(function (response) {
      if (requestToken !== state.searchVersion) return;
      const docs = response && Array.isArray(response.docs) ? response.docs : [];
      state.books = docs.slice(0, SEARCH_LIMIT).map(normalizeBook);
      const found = Number(response && (response.numFound ?? response.num_found));
      state.reportedTotal = Number.isFinite(found) && found >= 0 ? found : state.books.length;
      if (!state.books.length) {
        showMessage("#searchStatus", 'No books matched "' + query + '". Try another title or keyword.', "error");
        $("#resultSummary").text("0 search results.");
        $("#searchResults").empty().append(emptyState("No matches found", "Try a broader title, keyword, or spelling."));
        return;
      }
      hideMessage("#searchStatus");
      showSearchPage(1);
    }).fail(function (_xhr, status) {
      if (requestToken !== state.searchVersion) return;
      $("#resultSummary").text("Results unavailable.");
      $("#searchResults").empty().append(emptyState("Search unavailable", "Check your connection and submit the search again."));
      showMessage("#searchStatus", status === "timeout" ? "The Open Library request timed out. Please retry." : "Could not reach Open Library. Check your connection and retry.", "error");
    }).always(function () {
      if (requestToken === state.searchVersion) setSearching(false);
    });
  }

  function loadCollection() {
    $("#collectionResults").attr("aria-busy", "true").empty().append(emptyState("Loading Science Fiction", "Retrieving ten books from the Subjects API…", true));
    $("#retryCollection").prop("hidden", true);
    showMessage("#collectionStatus", "Loading the Science Fiction collection…");
    $.ajax({
      url: API + "/subjects/" + SUBJECT + ".json",
      method: "GET",
      dataType: "json",
      data: { limit: 10 },
      timeout: 20000
    }).done(function (response) {
      const works = response && Array.isArray(response.works) ? response.works : [];
      state.collection = works.slice(0, 10).map(normalizeBook);
      if (!state.collection.length) {
        showMessage("#collectionStatus", "No books are currently available in this subject collection.", "error");
        $("#collectionResults").empty().append(emptyState("Collection is empty", "Try again later."));
        return;
      }
      hideMessage("#collectionStatus");
      renderBooks("collection");
    }).fail(function (_xhr, status) {
      showMessage("#collectionStatus", status === "timeout" ? "Collection request timed out. You can retry." : "Unable to load this collection. Check your connection and retry.", "error");
      $("#collectionResults").empty().append(emptyState("Collection unavailable", "Use Retry Collection to try again."));
      $("#retryCollection").prop("hidden", false);
    }).always(function () { $("#collectionResults").attr("aria-busy", "false"); });
  }

  function descriptionText(work) {
    const value = work && work.description;
    return cleanText(typeof value === "string" ? value : value && value.value, "No description is available for this book.");
  }

  function relatedAuthorKeys(work) {
    return (work && Array.isArray(work.authors) ? work.authors : [])
      .map(entry => entry && ((entry.author && entry.author.key) || entry.key))
      .filter(key => typeof key === "string" && /^\/authors\/OL\d+A$/.test(key))
      .slice(0, 5);
  }

  function renderDetails(work, book, token) {
    if (token !== state.detailVersion) return;
    const title = cleanText(work && work.title, book.title);
    const cover = validCoverId(work && Array.isArray(work.covers) ? work.covers.find(id => validCoverId(id)) : 0) || book.cover;
    const subjects = (work && Array.isArray(work.subjects) ? work.subjects : [])
      .filter(x => typeof x === "string" && x.trim()).slice(0, 10).map(name => ({ name }));
    const firstPublished = cleanText(work && work.first_publish_date, book.year ? String(book.year) : "Not available");
    const lang = languageNames(work && work.languages && work.languages.length ? work.languages : book.languages);
    const authorText = book.authors.length ? book.authors.join(", ") : "Checking author records…";
    const model = {
      title: title,
      id: book.id,
      hasCover: Boolean(cover),
      coverUrl: getCoverUrl(cover, "L"),
      authorText: authorText,
      publicationText: firstPublished,
      languageText: lang,
      description: descriptionText(work),
      hasSubjects: subjects.length > 0,
      subjects: subjects,
      openLibraryUrl: API + "/works/" + book.id
    };
    const $target = $("#detailsContent");
    $target.html(Mustache.render($("#bookDetailsTemplate").html(), model));
    attachCoverFallback($target);
    $("#detailsSection").attr("aria-busy", "false");

    if (book.authors.length) return;
    const keys = relatedAuthorKeys(work);
    if (!keys.length) { $("#detailAuthors").text("Author information unavailable"); return; }
    const requests = keys.map(key => {
      if (state.authorCache.has(key)) return Promise.resolve(state.authorCache.get(key));
      return new Promise(resolve => {
        $.ajax({ url: API + key + ".json", method: "GET", dataType: "json", timeout: 12000 })
          .done(data => {
            const name = cleanText(data && data.name, "");
            if (name) state.authorCache.set(key, name);
            resolve(name);
          }).fail(() => resolve(""));
      });
    });
    Promise.all(requests).then(names => {
      if (token !== state.detailVersion) return;
      const found = names.filter(Boolean);
      $("#detailAuthors").text(found.length ? found.join(", ") : "Author information unavailable");
    });
  }

  function selectBook(book) {
    if (!book || !book.id) return;
    state.selectedWorkId = book.id;
    const token = ++state.detailVersion;
    updateSelectedCards();
    $("#detailsSection").attr("aria-busy", "true");
    $("#detailsContent").empty().append(loadingDetails(book.title));
    if (window.matchMedia("(max-width: 780px)").matches) {
      document.getElementById("detailsSection").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const cached = state.detailCache.get(book.id);
    if (cached) { renderDetails(cached, book, token); return; }
    $.ajax({ url: API + "/works/" + book.id + ".json", method: "GET", dataType: "json", timeout: 20000 })
      .done(work => {
        if (token !== state.detailVersion) return;
        state.detailCache.set(book.id, work);
        renderDetails(work, book, token);
      }).fail((_xhr, status) => {
        if (token !== state.detailVersion) return;
        const $error = $('<div class="detail-error">')
          .append($("<strong>").text("Could not load details"), $("<p>").text(status === "timeout" ? "Open Library timed out. Select the book again to retry." : "Please select the book again to retry."));
        $("#detailsContent").empty().append($error);
        $("#detailsSection").attr("aria-busy", "false");
      });
  }

  function activateTab(tab, focus) {
    if (tab !== "search" && tab !== "collection") return;
    state.activeTab = tab;
    $("#searchPanel").prop("hidden", tab !== "search");
    $("#collectionPanel").prop("hidden", tab !== "collection");
    $(".tab-button").each(function () {
      const active = $(this).attr("data-tab") === tab;
      $(this).toggleClass("is-active", active).attr("aria-selected", String(active)).attr("tabindex", active ? "0" : "-1");
      if (active && focus) $(this).trigger("focus");
    });
    // Only panel visibility changes. Search term, results, page and selection are untouched.
  }

  $("#searchForm").on("submit", function (event) {
    event.preventDefault();
    if (state.isSearching) return;
    const query = String($("#searchInput").val() || "").trim();
    if (!query) {
      showMessage("#searchStatus", "Enter a book title or keyword before searching.", "error");
      $("#searchInput").trigger("focus");
      return;
    }
    runSearch(query);
  });

  $(".tab-button").on("click", function () { activateTab($(this).attr("data-tab"), false); });
  $(".tab-button").on("keydown", function (event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" || (event.key === "ArrowLeft" && state.activeTab === "collection") ? "search" : "collection";
    activateTab(next, true);
  });

  $(".view-button").on("click", function () {
    const scope = $(this).attr("data-scope");
    const layout = $(this).attr("data-layout");
    if (!["search", "collection"].includes(scope) || !["grid", "list"].includes(layout)) return;
    state.layouts[scope] = layout;
    const $region = scope === "search" ? $("#searchResults") : $("#collectionResults");
    $region.toggleClass("books--grid", layout === "grid").toggleClass("books--list", layout === "list");
    $(".view-button[data-scope='" + scope + "']").each(function () {
      const selected = $(this).attr("data-layout") === layout;
      $(this).toggleClass("is-active", selected).attr("aria-pressed", String(selected));
    });
  });

  $("#pageButtons").on("click", "button[data-page]", function () {
    showSearchPage(Number($(this).attr("data-page")));
  });
  $("#previousPage").on("click", () => showSearchPage(state.currentPage - 1));
  $("#nextPage").on("click", () => showSearchPage(state.currentPage + 1));
  $("#searchResults, #collectionResults").on("click", ".book-pick[data-work-id]", function () {
    const id = $(this).attr("data-work-id");
    const source = $(this).closest("#collectionResults").length ? state.collection : state.books;
    const book = source.find(item => item.id === id);
    selectBook(book);
  });
  $("#retryCollection").on("click", loadCollection);

  loadCollection();
});
