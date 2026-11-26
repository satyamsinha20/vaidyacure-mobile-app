import { Booking } from '../../models/Booking.js';
import { Counter } from '../../models/Counter.js';
import { Doctor } from '../../models/Doctor.js';
import { AppError } from '../http.js';

/**
 * Every real doctor has one number, made by the server: VC-DOC-000001,
 * VC-DOC-000002 … It only counts up and a number is never given twice.
 */
const PREFIX = 'VC-DOC-';
const COUNTER_ID = 'doctor_registration';
export const DOCTOR_CODE_PATTERN = /^VC-DOC-\d{6,}$/;

export const formatDoctorCode = (n: number): string => `${PREFIX}${String(n).padStart(6, '0')}`;

/** The highest number a doctor already has (0 when there is none) */
const highestInUse = async (): Promise<number> => {
  const doctors = await Doctor.find({ doctorCode: DOCTOR_CODE_PATTERN }).select('doctorCode').lean();
  return doctors.reduce((max, d) => Math.max(max, Number(d.doctorCode.slice(PREFIX.length)) || 0), 0);
};

export const nextDoctorCode = async (): Promise<string> => {
  // Never behind a number already in use (e.g. if the counter was lost)
  await Counter.updateOne({ _id: COUNTER_ID }, { $max: { seq: await highestInUse() } }, { upsert: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    const counter = await Counter.findOneAndUpdate({ _id: COUNTER_ID }, { $inc: { seq: 1 } }, { new: true, upsert: true }).lean();
    const code = formatDoctorCode(counter?.seq ?? 0);
    if (counter && !(await Doctor.exists({ doctorCode: code }))) return code;
  }
  throw new AppError(500, 'Could not create a registration number. Please try again.', 'code_failed');
};

/**
 * Doctors added before these numbers (ids such as DR1007) get the next
 * numbers, oldest first; their sent reports show the new number too.
 */
export const ensureDoctorCodes = async (): Promise<void> => {
  const older = await Doctor.find({ doctorCode: { $not: DOCTOR_CODE_PATTERN } })
    .sort({ createdAt: 1 })
    .select('doctorCode')
    .lean();
  for (const d of older) {
    const code = await nextDoctorCode();
    const moved = await Doctor.updateOne({ _id: d._id, doctorCode: d.doctorCode }, { $set: { doctorCode: code } });
    if (moved.modifiedCount) {
      await Booking.updateMany(
        { doctor: d._id, report: { $ne: null } },
        { $set: { 'report.doctor.registrationNumber': code }, $unset: { 'report.doctor.registrationCouncil': '' } }
      );
    }
  }
};
