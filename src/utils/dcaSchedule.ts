import type { DcaFrequency, DcaPlan } from "@/types/dcaPlan";

const pad = (value: number) => String(value).padStart(2, "0");
export const DCA_EXECUTION_HOUR = 15;
export const DCA_EXECUTION_MINUTE = 30;
export const DCA_EXECUTION_TIME_LABEL = `${pad(DCA_EXECUTION_HOUR)}:${pad(DCA_EXECUTION_MINUTE)}`;

const isFuture = (candidate: Date, from: Date) => candidate.getTime() > from.getTime();
const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

const moveToNextWeekday = (candidate: Date) => {
  while (isWeekend(candidate)) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
};

export const normalizeDcaHour = (hour?: number) =>
  Number.isInteger(hour) && hour !== undefined ? Math.min(Math.max(hour, 0), 23) : 0;

export const computeNextDcaRunAt = (
  schedule: Pick<DcaPlan, "frequency" | "hour" | "weekday" | "month">,
  from = new Date()
) => {
  const base = new Date(from);

  if (schedule.frequency === "DAILY") {
    const candidate = new Date(base);
    candidate.setHours(DCA_EXECUTION_HOUR, DCA_EXECUTION_MINUTE, 0, 0);
    if (!isFuture(candidate, base)) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return moveToNextWeekday(candidate).toISOString();
  }

  if (schedule.frequency === "WEEKLY") {
    const weekday = schedule.weekday && schedule.weekday >= 1 && schedule.weekday <= 5 ? schedule.weekday : 1;
    const candidate = new Date(base);
    candidate.setHours(DCA_EXECUTION_HOUR, DCA_EXECUTION_MINUTE, 0, 0);
    const currentWeekday = candidate.getDay() === 0 ? 7 : candidate.getDay();
    const dayOffset = (weekday - currentWeekday + 7) % 7;
    candidate.setDate(candidate.getDate() + dayOffset);
    if (!isFuture(candidate, base)) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate.toISOString();
  }

  const month = schedule.month && schedule.month >= 1 && schedule.month <= 12 ? schedule.month : 1;
  const candidate = new Date(base.getFullYear(), month - 1, 1, DCA_EXECUTION_HOUR, DCA_EXECUTION_MINUTE, 0, 0);
  if (!isFuture(candidate, base)) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  return candidate.toISOString();
};

export const describeDcaSchedule = (plan: Pick<DcaPlan, "frequency" | "hour" | "weekday" | "month">) => {
  if (plan.frequency === "DAILY") {
    return `每个交易日 ${DCA_EXECUTION_TIME_LABEL}`;
  }
  if (plan.frequency === "WEEKLY") {
    const weekday = plan.weekday && plan.weekday >= 1 && plan.weekday <= 5 ? plan.weekday : 1;
    return `每周 ${["", "周一", "周二", "周三", "周四", "周五"][weekday]} ${DCA_EXECUTION_TIME_LABEL}`;
  }
  const month = plan.month && plan.month >= 1 && plan.month <= 12 ? plan.month : 1;
  return `每年 ${month} 月 1 日 ${DCA_EXECUTION_TIME_LABEL}`;
};

export const formatDcaDateTime = (iso?: string) => {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
};
