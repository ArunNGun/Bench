/**
 * UI string translations for EN and DE.
 *
 * Keep keys flat and descriptive. Only strings that appear in the UI are here.
 * Library content (compound names, citations) is always English.
 */

export type Lang = "en" | "de";

export const TRANSLATIONS = {
  en: {
    // Nav
    nav_now: "Now",
    nav_plan: "Plan",
    nav_log: "Log",
    nav_stock: "Stock",
    nav_calc: "Calc",
    nav_about: "About",
    nav_bloodwork: "Bloodwork",
    nav_library: "Library",

    // Common actions
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    close: "Close",
    confirm: "Confirm",
    back: "Back",
    next: "Next",
    done: "Done",
    loading: "Loading\u2026",

    // Plan page
    plan_title: "Plan",
    plan_subtitle: "What you are running, at what dose, on what schedule.",
    plan_new_protocol: "New protocol",
    plan_no_protocols: "No protocols yet",
    plan_no_protocols_desc: "A protocol ties a peptide to a dose and a schedule. It drives what shows as due on the Now page and how your stock burns down.",
    plan_create_one: "Create one",
    plan_per_week: "per week",
    plan_next: "next",
    plan_started: "Started",
    plan_rotating_sites: "rotating {n} sites",
    plan_paused: "paused",
    plan_week_band: "week band",
    plan_step: "step",
    plan_of: "of",
    plan_edit_protocol: "Edit protocol",
    plan_new_protocol_form: "New protocol",

    // Stock page
    stock_title: "Stock",
    stock_subtitle: "Vials from sealed to empty.",
    stock_add_vial: "Add vial",
    stock_no_vials: "No vials yet",
    stock_sealed: "Sealed",
    stock_in_use: "In use",
    stock_empty: "Empty",
    stock_expires: "Expires",
    stock_cost: "Cost",
    stock_remaining: "Remaining",
    stock_delete_vial: "Delete vial record",

    // Log page
    log_title: "Log",
    log_subtitle: "Every dose you have taken.",
    log_new_dose: "Log dose",
    log_no_logs: "No doses logged yet",
    log_skipped: "skipped",

    // Settings page
    settings_title: "Settings",
    settings_defaults: "Defaults",
    settings_your_data: "Your data",
    settings_erase: "Erase everything",
    settings_version: "App version",
    settings_theme: "Theme",
    settings_language: "Language",

    // About page
    about_title: "About",

    // Now page
    now_title: "Now",
    now_nothing_due: "Nothing due right now",
    now_due: "Due",
    now_overdue: "Overdue",

    // Calculator page
    calc_title: "Calculator",

    // Labs page
    labs_title: "Bloodwork",

    // Library page
    library_title: "Library",

    // Errors / notices
    error_generic: "Something went wrong.",
  },

  de: {
    // Nav
    nav_now: "Jetzt",
    nav_plan: "Plan",
    nav_log: "Protokoll",
    nav_stock: "Vorrat",
    nav_calc: "Rechner",
    nav_about: "Info",
    nav_bloodwork: "Blutbild",
    nav_library: "Bibliothek",

    // Common actions
    save: "Speichern",
    cancel: "Abbrechen",
    delete: "L\u00f6schen",
    edit: "Bearbeiten",
    add: "Hinzuf\u00fcgen",
    close: "Schlie\u00dfen",
    confirm: "Best\u00e4tigen",
    back: "Zur\u00fcck",
    next: "Weiter",
    done: "Fertig",
    loading: "Laden\u2026",

    // Plan page
    plan_title: "Plan",
    plan_subtitle: "Was du verwendest, in welcher Dosis und nach welchem Schema.",
    plan_new_protocol: "Neues Protokoll",
    plan_no_protocols: "Noch keine Protokolle",
    plan_no_protocols_desc: "Ein Protokoll verbindet ein Peptid mit einer Dosis und einem Zeitplan. Es steuert, was auf der Jetzt-Seite angezeigt wird und wie dein Vorrat aufgebraucht wird.",
    plan_create_one: "Erstellen",
    plan_per_week: "pro Woche",
    plan_next: "n\u00e4chste",
    plan_started: "Gestartet",
    plan_rotating_sites: "{n} Stellen im Wechsel",
    plan_paused: "pausiert",
    plan_week_band: "Wochenband",
    plan_step: "Schritt",
    plan_of: "von",
    plan_edit_protocol: "Protokoll bearbeiten",
    plan_new_protocol_form: "Neues Protokoll",

    // Stock page
    stock_title: "Vorrat",
    stock_subtitle: "Ampullen von versiegelt bis leer.",
    stock_add_vial: "Ampulle hinzuf\u00fcgen",
    stock_no_vials: "Noch keine Ampullen",
    stock_sealed: "Versiegelt",
    stock_in_use: "In Verwendung",
    stock_empty: "Leer",
    stock_expires: "Ablaufdatum",
    stock_cost: "Kosten",
    stock_remaining: "Verbleibend",
    stock_delete_vial: "Ampullen-Eintrag l\u00f6schen",

    // Log page
    log_title: "Protokoll",
    log_subtitle: "Jede Dosis, die du genommen hast.",
    log_new_dose: "Dosis eintragen",
    log_no_logs: "Noch keine Dosen eingetragen",
    log_skipped: "ausgelassen",

    // Settings page
    settings_title: "Einstellungen",
    settings_defaults: "Standards",
    settings_your_data: "Deine Daten",
    settings_erase: "Alles l\u00f6schen",
    settings_version: "App-Version",
    settings_theme: "Design",
    settings_language: "Sprache",

    // About page
    about_title: "Info",

    // Now page
    now_title: "Jetzt",
    now_nothing_due: "Gerade nichts f\u00e4llig",
    now_due: "F\u00e4llig",
    now_overdue: "\u00dcberf\u00e4llig",

    // Calculator page
    calc_title: "Rechner",

    // Labs page
    labs_title: "Blutbild",

    // Library page
    library_title: "Bibliothek",

    // Errors / notices
    error_generic: "Etwas ist schiefgelaufen.",
  },
} satisfies Record<Lang, Record<string, string>>;

export type TranslationKey = keyof typeof TRANSLATIONS.en;
