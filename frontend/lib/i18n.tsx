"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "ru";

// All UI strings. Keep keys flat; add new ones as features grow.
const DICT: Record<string, { en: string; ru: string }> = {
  "app.title": { en: "Fleet AI Dashboard", ru: "Панель автопарка ИИ" },
  "tab.map": { en: "Map", ru: "Карта" },
  "tab.reports": { en: "Reports", ru: "Отчёты" },
  "tab.alerts": { en: "Alerts", ru: "Оповещения" },
  "tab.admin": { en: "DB", ru: "База" },
  "tab.system": { en: "System", ru: "Журнал" },

  "admin.tables": { en: "Tables", ru: "Таблицы" },
  "admin.loading": { en: "Loading…", ru: "Загрузка…" },
  "admin.rows": { en: "rows", ru: "строк" },
  "admin.of": { en: "of", ru: "из" },
  "admin.prev": { en: "← Prev", ru: "← Назад" },
  "admin.next": { en: "Next →", ru: "Вперёд →" },

  "auth.title": { en: "Sign in", ru: "Вход" },
  "auth.username": { en: "Username", ru: "Логин" },
  "auth.password": { en: "Password", ru: "Пароль" },
  "auth.signIn": { en: "Sign in", ru: "Войти" },
  "auth.signingIn": { en: "Signing in…", ru: "Входим…" },
  "auth.badCreds": { en: "Invalid username or password", ru: "Неверный логин или пароль" },
  "auth.logout": { en: "Log out", ru: "Выйти" },

  "profile.title": { en: "My profile", ru: "Мой профиль" },
  "profile.newPassword": { en: "New password (leave blank to keep)", ru: "Новый пароль (пусто — не менять)" },
  "profile.avatar": { en: "Avatar", ru: "Аватар" },
  "profile.upload": { en: "Upload image", ru: "Загрузить изображение" },
  "profile.save": { en: "Save profile", ru: "Сохранить профиль" },
  "profile.saved": { en: "Saved", ru: "Сохранено" },
  "profile.back": { en: "← Back to dashboard", ru: "← Назад в дашборд" },

  "settings.title": { en: "Settings", ru: "Настройки" },
  "settings.language": { en: "Language", ru: "Язык" },
  "settings.hourFormat": { en: "Hour format", ru: "Формат времени" },
  "settings.theme": { en: "Theme", ru: "Тема" },
  "settings.timezone": { en: "Time zone", ru: "Часовой пояс" },
  "theme.light": { en: "Light", ru: "Светлая" },
  "theme.dark": { en: "Dark", ru: "Тёмная" },

  "users.title": { en: "Users", ru: "Пользователи" },
  "users.create": { en: "Register user", ru: "Зарегистрировать юзера" },
  "users.role": { en: "Role", ru: "Роль" },
  "users.permissions": { en: "Permissions", ru: "Права" },
  "users.add": { en: "Create user", ru: "Создать" },
  "users.delete": { en: "Delete", ru: "Удалить" },
  "users.save": { en: "Save", ru: "Сохранить" },
  "role.admin": { en: "Admin", ru: "Админ" },
  "role.moderator": { en: "Moderator", ru: "Модератор" },

  "perm.view_map": { en: "View map", ru: "Просмотр карты" },
  "perm.view_reports": { en: "View reports", ru: "Просмотр отчётов" },
  "perm.generate_reports": { en: "Generate reports", ru: "Создание отчётов" },
  "perm.view_alerts": { en: "View alerts", ru: "Просмотр оповещений" },
  "perm.view_db": { en: "View database", ru: "Просмотр базы" },
  "perm.view_logs": { en: "View system journal", ru: "Просмотр журнала" },
  "perm.manage_users": { en: "Manage users", ru: "Управление юзерами" },

  "metric.total": { en: "Total", ru: "Всего" },
  "metric.moving": { en: "Moving", ru: "В пути" },
  "metric.idle": { en: "Idle", ru: "Стоят" },
  "metric.fault": { en: "Fault", ru: "Неисправность" },
  "filter.reset": { en: "Reset", ru: "Сбросить" },

  "detail.selectPrompt": { en: "Select a truck on the map to see its details.", ru: "Выберите трак на карте, чтобы увидеть детали." },
  "detail.truck": { en: "Truck", ru: "Трак" },
  "detail.driver": { en: "Driver", ru: "Водитель" },
  "detail.speed": { en: "Speed", ru: "Скорость" },
  "detail.engine": { en: "Engine", ru: "Двигатель" },
  "detail.heading": { en: "Heading", ru: "Курс" },
  "detail.location": { en: "Location", ru: "Локация" },
  "detail.telemetry": { en: "Telemetry", ru: "Телеметрия" },
  "detail.odometer": { en: "Odometer", ru: "Пробег" },
  "detail.engineHours": { en: "Engine hours", ru: "Моточасы" },
  "detail.def": { en: "DEF level", ru: "Уровень DEF" },
  "detail.coolant": { en: "Coolant temp", ru: "Темп. охлаждающей" },
  "detail.battery": { en: "Battery", ru: "АКБ" },
  "detail.ambient": { en: "Ambient temp", ru: "Темп. за бортом" },
  "detail.rpm": { en: "Engine RPM", ru: "Обороты" },
  "detail.load": { en: "Engine load", ru: "Нагрузка" },
  "detail.vehicleInfo": { en: "Vehicle info", ru: "О машине" },
  "detail.makeModel": { en: "Make / Model", ru: "Марка / Модель" },
  "detail.year": { en: "Year", ru: "Год" },
  "detail.plate": { en: "License plate", ru: "Госномер" },
  "detail.vin": { en: "VIN", ru: "VIN" },
  "detail.hos": { en: "Hours of Service (HOS)", ru: "Часы работы (HOS)" },
  "hos.duty": { en: "Duty status", ru: "Статус смены" },
  "hos.drive": { en: "Drive left", ru: "За рулём осталось" },
  "hos.shift": { en: "Shift left", ru: "Смена осталось" },
  "hos.cycle": { en: "Cycle left", ru: "Цикл осталось" },
  "hos.break": { en: "Break in", ru: "Перерыв через" },
  "hos.violation": { en: "HOS violation", ru: "Нарушение HOS" },
  "hos.status.driving": { en: "Driving", ru: "За рулём" },
  "hos.status.onDuty": { en: "On duty", ru: "На смене" },
  "hos.status.offDuty": { en: "Off duty", ru: "Отдых" },
  "hos.status.sleeperBed": { en: "Sleeper", ru: "Спальник" },
  "detail.faultCodes": { en: "Fault codes", ru: "Коды ошибок" },
  "detail.noFaults": { en: "No stored fault codes", ru: "Нет сохранённых кодов" },
  "detail.driveOk": { en: "Drivable", ru: "Ехать можно" },
  "detail.driveNo": { en: "DO NOT DRIVE", ru: "ЕХАТЬ НЕЛЬЗЯ" },
  "detail.dashcam": { en: "Latest dash cam", ru: "Последнее видео" },
  "detail.updated": { en: "Updated", ru: "Обновлено" },
  "detail.genReport": { en: "Generate report", ru: "Составить отчёт" },
  "detail.generating": { en: "Generating report…", ru: "Генерирую отчёт…" },
  "detail.reportSaved": { en: "Report saved — see the Reports tab", ru: "Отчёт сохранён — вкладка «Отчёты»" },
  "detail.reportError": { en: "Couldn't generate the report — check the backend logs.", ru: "Не удалось создать отчёт — проверьте логи бэкенда." },

  "chat.title": { en: "Fleet Assistant", ru: "Ассистент автопарка" },
  "chat.placeholder": { en: "Ask about the fleet…", ru: "Спросите об автопарке…" },
  "chat.empty": { en: 'Ask about the fleet — e.g.\n"Which trucks have fault codes?"', ru: "Спросите об автопарке — напр.\n«У каких траков есть ошибки?»" },
  "chat.send": { en: "Send", ru: "Отправить" },
  "chat.thinking": { en: "Assistant is thinking…", ru: "Ассистент думает…" },
  "chat.error": { en: "Something went wrong — check the backend logs.", ru: "Что-то пошло не так — проверьте логи бэкенда." },

  "reports.trucksWithReports": { en: "Trucks with reports", ru: "Траки с отчётами" },
  "reports.reports": { en: "Reports", ru: "Отчёты" },
  "reports.report": { en: "report", ru: "отчёт" },
  "reports.reportsWord": { en: "reports", ru: "отчётов" },
  "reports.trucksWord": { en: "trucks", ru: "траков" },
  "reports.truckWord": { en: "truck", ru: "трак" },
  "reports.generateAll": { en: "Generate reports for all trucks", ru: "Отчёты по всем тракам" },
  "reports.generatingAll": { en: "Generating… (may take a minute)", ru: "Генерация… (до минуты)" },
  "reports.noReportsTitle": { en: "No reports yet", ru: "Отчётов пока нет" },
  "reports.noReportsHint": { en: 'Use "Generate reports for all trucks" above, click "Generate report" on a truck, or ask the assistant — e.g. "Make a report for truck 131".', ru: "Нажмите «Отчёты по всем тракам» сверху, кнопку «Составить отчёт» у трака, или попросите ассистента — напр. «Сделай отчёт по траку 131»." },
  "reports.loading": { en: "Loading reports…", ru: "Загрузка отчётов…" },
  "reports.sincePrevious": { en: "Since previous", ru: "С прошлого отчёта" },
  "reports.noChange": { en: "no change", ru: "без изменений" },

  "alerts.loading": { en: "Loading alerts…", ru: "Загрузка оповещений…" },
  "alerts.noneTitle": { en: "No active alerts", ru: "Активных оповещений нет" },
  "alerts.noneHint": { en: "No trucks currently have a lit fault lamp.", ru: "Ни у одного трака сейчас не горит лампа неисправности." },
  "alerts.faults": { en: "Faults", ru: "Ошибки" },
  "alerts.drivable": { en: "Drivable — service soon", ru: "Ехать можно — сервис скоро" },
  "alerts.drivableUrgent": { en: "Drivable — inspect urgently", ru: "Ехать можно — срочно в сервис" },
  "alerts.notDrivable": { en: "DO NOT DRIVE — stop the vehicle now", ru: "ЕХАТЬ НЕЛЬЗЯ — остановите трак" },
  "alerts.severity.high": { en: "HIGH", ru: "ВЫСОКАЯ" },
  "alerts.severity.medium": { en: "MEDIUM", ru: "СРЕДНЯЯ" },
  "alerts.severity.low": { en: "LOW", ru: "НИЗКАЯ" },
  "alerts.level.critical": { en: "Critical", ru: "Критично" },
  "alerts.level.warning": { en: "Warning", ru: "Предупреждение" },
  "alerts.level.emissions": { en: "Emissions", ru: "Выбросы" },

  "log.title": { en: "System journal", ru: "Системный журнал" },
  "log.runSelfTest": { en: "Run self-test now", ru: "Запустить самотест" },
  "log.running": { en: "Running self-test…", ru: "Выполняю самотест…" },
  "log.clear": { en: "Clear journal", ru: "Очистить журнал" },
  "log.clearConfirm": { en: "Clear the whole system journal? This cannot be undone.", ru: "Очистить весь журнал? Это действие необратимо." },
  "log.loading": { en: "Loading journal…", ru: "Загрузка журнала…" },
  "log.scheduled": { en: "Self-tests", ru: "Самотесты" },
  "log.runtime": { en: "Runtime errors", ru: "Ошибки во время работы" },
  "log.noScheduled": { en: "No self-test results yet — run one above.", ru: "Результатов самотеста пока нет — запустите его сверху." },
  "log.noRuntime": { en: "No runtime errors recorded — all clear.", ru: "Ошибок не зафиксировано — всё чисто." },
  "log.level.ok": { en: "OK", ru: "ОК" },
  "log.level.warning": { en: "Warning", ru: "Внимание" },
  "log.level.error": { en: "Error", ru: "Ошибка" },

  "conn.good": { en: "Good connection", ru: "Хорошая связь" },
  "conn.fair": { en: "Fair connection", ru: "Средняя связь" },
  "conn.poor": { en: "Poor connection", ru: "Слабая связь" },
  "conn.none": { en: "No connection", ru: "Нет связи" },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };
const LangContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("lang")) as Lang | null;
    if (saved === "en" || saved === "ru") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
  };

  const t = (key: string) => DICT[key]?.[lang] ?? DICT[key]?.en ?? key;

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
