import { Schema } from 'mongoose';

/** Weekly working hours in India time, e.g. { day: 1, start: "10:00", end: "13:00" } (0 = Sunday) */
export interface IWeeklyHours {
  day: number;
  start: string;
  end: string;
}

export interface IAvailability {
  weekly: IWeeklyHours[];
  /** Leave / holidays as "YYYY-MM-DD" */
  daysOff: string[];
}

export const EMPTY_AVAILABILITY: IAvailability = { weekly: [], daysOff: [] };

export const AvailabilitySchema = new Schema<IAvailability>(
  {
    weekly: [
      {
        _id: false,
        day: { type: Number, min: 0, max: 6, required: true },
        start: { type: String, required: true },
        end: { type: String, required: true },
      },
    ],
    daysOff: [{ type: String }],
  },
  { _id: false }
);
