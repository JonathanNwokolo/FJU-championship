import {
  AttendanceError,
  applyConvocationStatusEffect,
  closeConvocation,
  getAttendanceErrorMessage,
  getConvocationErrorMessage,
  getConvocationFor,
  getMatchAttendances,
  markAttendancesForReconfirmation,
  respondAttendance,
  saveConvocation,
  ConvocationError,
} from '../services/index';
import type {
  AttendanceErrorCode,
  AttendanceResult,
  CloseConvocationContext,
  ConvocationErrorCode,
  ConvocationResult,
  RespondAttendanceContext,
  SaveConvocationContext,
} from '../services/index';

describe('services barrel', () => {
  it('exports the public convocation and attendance service contract', () => {
    const convocationCode: ConvocationErrorCode = 'convocation_locked';
    const attendanceCode: AttendanceErrorCode = 'match_locked';
    const saveCtx = {} as SaveConvocationContext;
    const closeCtx = {} as CloseConvocationContext;
    const attendanceCtx = {} as RespondAttendanceContext;
    const convocationResult = {} as ConvocationResult;
    const attendanceResult = {} as AttendanceResult;

    expect(convocationCode).toBe('convocation_locked');
    expect(attendanceCode).toBe('match_locked');
    expect(saveCtx).toBeDefined();
    expect(closeCtx).toBeDefined();
    expect(attendanceCtx).toBeDefined();
    expect(convocationResult).toBeDefined();
    expect(attendanceResult).toBeDefined();

    expect(saveConvocation).toEqual(expect.any(Function));
    expect(closeConvocation).toEqual(expect.any(Function));
    expect(applyConvocationStatusEffect).toEqual(expect.any(Function));
    expect(getConvocationErrorMessage).toEqual(expect.any(Function));
    expect(ConvocationError).toEqual(expect.any(Function));

    expect(respondAttendance).toEqual(expect.any(Function));
    expect(markAttendancesForReconfirmation).toEqual(expect.any(Function));
    expect(getMatchAttendances).toEqual(expect.any(Function));
    expect(getConvocationFor).toEqual(expect.any(Function));
    expect(getAttendanceErrorMessage).toEqual(expect.any(Function));
    expect(AttendanceError).toEqual(expect.any(Function));
  });
});
