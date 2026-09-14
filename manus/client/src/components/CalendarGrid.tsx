import { BookmarkCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type AcademicEvent, formatScheduleDate } from "@/lib/academicData";
import { dateKey, eventsOnDate, shortTitle } from "@/lib/scheduleView";
import type { CustomTagRecord, NoteRecord } from "@/lib/favoriteStore";

type CalendarGridProps = { visibleMonth: Date; events: AcademicEvent[]; isLoading: boolean; favoriteIds: Set<string>; notes: Record<string, NoteRecord>; customTags: Record<string, CustomTagRecord>; conflictDateKeys: Set<string>; onPrevious: () => void; onNext: () => void; onToday: () => void; onEventSelect: (event: AcademicEvent) => void; };
export function CalendarGrid({ visibleMonth, events, favoriteIds, onPrevious, onNext, onToday, onEventSelect }: CalendarGridProps) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const today = dateKey(new Date());
  const expandedEvents = expandedDay ? eventsOnDate(events, expandedDay) : [];
  const monthStart = dateKey(new Date(year, month, 1));
  const monthEnd = dateKey(new Date(year, month + 1, 0));
  const monthEvents = events.filter(event => event.start <= monthEnd && (event.end || event.start) >= monthStart).sort((a,b) => a.start.localeCompare(b.start) || (b.end || b.start).localeCompare(a.end || a.start) || a.id.localeCompare(b.id));
  const count = monthEvents.length;
  const weeks = Array.from({length: totalCells / 7}, (_, week) => {
    const keys = Array.from({length:7}, (_,col) => dateKey(new Date(year,month,week*7+col-firstWeekday+1)));
    const laneEnds: number[] = [];
    const segments = monthEvents.filter(e => e.start <= keys[6] && (e.end || e.start) >= keys[0]).map(event => {
      const start = keys.findIndex(k => k >= event.start && k >= monthStart);
      let end=6;
      while(end>=0 && (keys[end] > (event.end || event.start) || keys[end] > monthEnd)) end--;
      let lane=laneEnds.findIndex(last => last < start);
      if(lane<0) lane=laneEnds.length;
      laneEnds[lane]=end;
      return {event,start,end,lane,before:event.start<keys[start],after:(event.end || event.start)>keys[end]};
    });
    return {keys,segments,lanes:laneEnds.length};
  });
  return <section className="calendar-card" aria-labelledby="calendar-heading">
    <div className="calendar-card__toolbar"><div><h2 id="calendar-heading">{year}년 {month + 1}월 <span>{count}건</span></h2></div><div className="calendar-actions" aria-label="달력 이동"><button onClick={onPrevious} aria-label="이전 달"><ChevronLeft size={19} /></button><button onClick={onToday}>오늘</button><button onClick={onNext} aria-label="다음 달"><ChevronRight size={19} /></button></div></div>
    {!count && <p className="month-empty" role="status">이 달에는 조건에 맞는 일정이 없습니다. 다른 달이나 목록에서 확인해 보세요.</p>}
    <div className="calendar-weekdays" aria-hidden="true">{["일", "월", "화", "수", "목", "금", "토"].map(name => <span key={name}>{name}</span>)}</div>
    <div className="calendar-weeks">{weeks.map(({keys,segments,lanes}) => <div className="calendar-week" key={keys[0]}>
      <div className="calendar-week__dates">{keys.map(key => {
        const inMonth = key >= monthStart && key <= monthEnd;
        return <div className={`calendar-week__day ${!inMonth ? "is-outside" : ""} ${key === today ? "is-today" : ""}`} key={key}>{inMonth && <button type="button" className="calendar-day__date" aria-label={`${month+1}월 ${Number(key.slice(8))}일, 일정 ${eventsOnDate(monthEvents,key).length}건`} aria-current={key===today ? "date" : undefined} onClick={()=>setExpandedDay(key)}><span>{Number(key.slice(8))}</span></button>}</div>;
      })}</div>
      <div className="calendar-week__bars" style={{gridTemplateRows:`repeat(${Math.max(2,lanes)},30px)`}}>{segments.map(({event,start,end,lane,before,after}) => <button type="button" key={event.id} className={`calendar-span calendar-span--${event.category} ${before ? "continues-before" : ""} ${after ? "continues-after" : ""}`} style={{gridColumn:`${start+1} / ${end+2}`,gridRow:lane+1}} onClick={()=>onEventSelect(event)} title={`${event.title} (${formatScheduleDate(event)})`} aria-label={`${event.title}, ${formatScheduleDate(event)}`}>
        {before && <ChevronLeft size={12} aria-hidden="true"/>}<span>{shortTitle(event.title)}</span>{favoriteIds.has(event.id) && <BookmarkCheck size={12} aria-label="저장됨"/>}{after && <ChevronRight size={12} aria-hidden="true"/>}
      </button>)}</div>
    </div>)}</div>
    <p className="calendar-help">이어진 막대는 일정의 전체 기간입니다. 일정이나 날짜를 눌러 자세히 확인하세요.</p>
    {count > 0 && <div className="month-overview"><h3>이번 달 일정 <span>{count}</span></h3>{monthEvents.map(event => <button type="button" key={event.id} onClick={()=>onEventSelect(event)}><span className="month-overview__date">{formatScheduleDate(event)}</span><strong>{shortTitle(event.title)}</strong><ChevronRight size={16} aria-hidden="true"/></button>)}</div>}
    <Dialog open={Boolean(expandedDay)} onOpenChange={open => { if (!open) setExpandedDay(null); }}><DialogContent className="calendar-day-dialog"><DialogHeader><DialogTitle>{expandedDay ? `${Number(expandedDay.slice(5, 7))}월 ${Number(expandedDay.slice(8, 10))}일 일정` : "일정"}</DialogTitle><DialogDescription>진행 중인 일정을 포함해 {expandedEvents.length}건입니다.</DialogDescription></DialogHeader><div className="calendar-day-dialog__events">{expandedEvents.map(event => <button key={event.id} onClick={() => { setExpandedDay(null); onEventSelect(event); }}><span>{formatScheduleDate(event)}</span><strong>{shortTitle(event.title)}</strong><ChevronRight size={18} /></button>)}{!expandedEvents.length && <p>이 날짜에 해당하는 일정이 없습니다.</p>}</div></DialogContent></Dialog>
  </section>;
}
