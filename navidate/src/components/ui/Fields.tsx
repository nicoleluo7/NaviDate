"use client";

import { useState, type ReactNode } from "react";
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarGridBody,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  DialogTrigger,
  FieldError,
  Group,
  Heading,
  I18nProvider,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  TimeField,
} from "react-aria-components";
import { parseDate, parseTime } from "@internationalized/date";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";

type Option = { id: string; name: string };
export function SelectField({
  label,
  value,
  options,
  onChange,
  icon,
  className = "",
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Select
      className={`soft-field ${className}`}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key));
      }}
    >
      <Label className="field-label">
        {icon}
        {label}
      </Label>
      <Button className="field-control select-trigger">
        <SelectValue />
        <ChevronDown size={17} aria-hidden="true" />
      </Button>
      <Popover
        className="field-popover select-popover"
        offset={8}
        placement="bottom start"
      >
        <ListBox className="option-list" items={options}>
          {(item) => (
            <ListBoxItem
              id={item.id}
              textValue={item.name}
              className="field-option"
            >
              {({ isSelected }) => (
                <>
                  <span>{item.name}</span>
                  {isSelected && <Check size={16} aria-hidden="true" />}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}

export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <I18nProvider locale="en-US">
      <DatePicker
        className="soft-field date-field"
        value={value ? parseDate(value) : null}
        onChange={(date) => onChange(date?.toString() ?? "")}
        isRequired
      >
        <Label className="field-label">Date</Label>
        <Group className="field-control segmented-control">
          <DateInput className="segment-input">
            {(segment) => (
              <DateSegment className="date-segment" segment={segment}>
                {segment.type === "literal"
                  ? segment.text.replace(/\s/g, " ")
                  : segment.text}
              </DateSegment>
            )}
          </DateInput>
          <Button className="field-icon-button" aria-label="Choose date">
            <CalendarDays size={19} />
          </Button>
        </Group>
        <FieldError className="field-error" />
        <Popover
          className="field-popover calendar-popover"
          offset={8}
          placement="bottom start"
        >
          <Dialog aria-label="Choose your date" className="picker-dialog">
            <Calendar className="soft-calendar">
              <header className="calendar-header">
                <Button slot="previous" className="field-icon-button">
                  <ChevronLeft size={19} />
                </Button>
                <Heading />
                <Button slot="next" className="field-icon-button">
                  <ChevronRight size={19} />
                </Button>
              </header>
              <CalendarGrid weekdayStyle="short">
                <CalendarGridHeader>
                  {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
                </CalendarGridHeader>
                <CalendarGridBody>
                  {(date) => (
                    <CalendarCell date={date} className="calendar-day" />
                  )}
                </CalendarGridBody>
              </CalendarGrid>
            </Calendar>
            <p className="picker-note">
              A little something to look forward to.
            </p>
          </Dialog>
        </Popover>
      </DatePicker>
    </I18nProvider>
  );
}
const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4),
    minute = (index % 4) * 15;
  return {
    id: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    name: `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`,
  };
});
// Node and browser ICU data can disagree on the space before AM/PM.
// Normalize literal whitespace so SSR and hydration render identical text.
export function StartTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <I18nProvider locale="en-US">
      <div className="soft-field">
        <TimeField
          value={value ? parseTime(value) : null}
          onChange={(time) => onChange(time?.toString().slice(0, 5) ?? "")}
          hourCycle={12}
          granularity="minute"
          isRequired
        >
          <Label className="field-label">
            Start time <small>New York</small>
          </Label>
          <Group className="field-control segmented-control">
            <DateInput className="segment-input">
              {(segment) => (
                <DateSegment className="date-segment" segment={segment}>
                  {segment.type === "literal"
                    ? segment.text.replace(/\s/g, " ")
                    : segment.text}
                </DateSegment>
              )}
            </DateInput>
            <DialogTrigger isOpen={open} onOpenChange={setOpen}>
              <Button
                className="field-icon-button"
                aria-label="Choose start time"
              >
                <Clock size={19} />
              </Button>
              <Popover
                className="field-popover time-popover"
                placement="bottom end"
                offset={8}
              >
                <Dialog
                  className="picker-dialog"
                  aria-label="Choose a start time"
                >
                  <Heading slot="title">When shall we meet?</Heading>
                  <p className="picker-note">
                    New York time · or type any minute in the field
                  </p>
                  <ListBox
                    className="option-list time-options"
                    aria-label="Start time suggestions"
                    selectionMode="single"
                    selectedKeys={value ? [value] : []}
                    autoFocus="first"
                    onSelectionChange={(keys) => {
                      if (keys === "all") return;
                      const key = keys.values().next().value;
                      if (key != null) {
                        onChange(String(key));
                        setOpen(false);
                      }
                    }}
                    onAction={(key) => {
                      onChange(String(key));
                      setOpen(false);
                    }}
                    items={timeOptions}
                  >
                    {(item) => (
                      <ListBoxItem
                        id={item.id}
                        textValue={item.name}
                        className="field-option"
                      >
                        {({ isSelected }) => (
                          <>
                            <span>{item.name}</span>
                            {isSelected && (
                              <Check size={16} aria-hidden="true" />
                            )}
                          </>
                        )}
                      </ListBoxItem>
                    )}
                  </ListBox>
                </Dialog>
              </Popover>
            </DialogTrigger>
          </Group>
          <FieldError className="field-error" />
        </TimeField>
      </div>
    </I18nProvider>
  );
}
