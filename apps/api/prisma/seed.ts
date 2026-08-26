/**
 * Mock database seed — synthetic hospital credit-balance data only.
 * No production PHI. Safe to re-run (wipes operational mock rows under demo tenants).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, RuleOperator, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const REASONS: Array<{ code: number; name: string }> = [
  { code: 1, name: "Unclassified / Review" },
  { code: 2, name: "$0 and Negative Charge Amounts" },
  { code: 3, name: "EMR to ERA Charge Discrepancies" },
  { code: 4, name: "Total Insurance Transactions Greater than Total Charges" },
  { code: 5, name: "Secondary Insurance Greater than Patient Liability" },
  { code: 7, name: "Patient Payments Greater Than Liability (ERA)" },
  { code: 8, name: "Patient Payments Equal Credit Balance" },
  { code: 9, name: "Patient Payments Greater Than Total Charges" },
  { code: 10, name: "Small Balance Write Off" },
  { code: 11, name: "Admin Adj with No Insurance Discrepancies" },
  { code: 12, name: "Administrative Adjustments = 100% of Charges" },
  { code: 13, name: "Charity Write-offs = 100% of Charges" },
  { code: 14, name: "Medicaid Patients With a Patient Payment" },
  { code: 15, name: "ACE County" },
  { code: 18, name: "Medi-cal HPSM mass posting" },
  { code: 20, name: "LTC Location" },
];

const STATUSES = [
  { code: 1, name: "Open" },
  { code: 2, name: "In Progress" },
  { code: 3, name: "Completed" },
  { code: 4, name: "Escalated" },
];

const PAYER_CATS = [
  { code: "medicare", name: "Medicare" },
  { code: "medicaid", name: "Medicaid" },
  { code: "commercial", name: "Commercial" },
  { code: "self_pay", name: "Self Pay" },
  { code: "government", name: "Government Other" },
  { code: "charity", name: "Charity" },
];

const FIRST = [
  "Alex", "Jordan", "Casey", "Riley", "Morgan", "Avery", "Quinn", "Taylor",
  "Jamie", "Reese", "Skyler", "Cameron", "Drew", "Blake", "Parker", "Harper",
];
const LAST = [
  "Anderson", "Baker", "Chen", "Diaz", "Evans", "Foster", "Garcia", "Hayes",
  "Ingram", "Jones", "Kim", "Lopez", "Miller", "Nguyen", "Owens", "Patel",
];

const LOCATIONS = ["MAIN", "NORTH", "ED", "ORTHO", "LTC", "OP"];
const PATIENT_TYPES = ["I", "O", "E"];

const PLANS: Array<{
  code: string;
  name: string;
  cat: string;
}> = [
  { code: "C95", name: "MEDICAID PLAN ALPHA", cat: "medicaid" },
  { code: "C72", name: "MEDICAID PLAN BETA", cat: "medicaid" },
  { code: "C10", name: "MEDICAID PLAN GAMMA", cat: "medicaid" },
  { code: "N90", name: "MEDICARE PART A SAMPLE", cat: "medicare" },
  { code: "M40", name: "MEDICARE PART B SAMPLE", cat: "medicare" },
  { code: "M30", name: "MEDICARE ADVANTAGE SAMPLE", cat: "medicare" },
  { code: "COMM1", name: "COMMERCIAL BLUE SAMPLE", cat: "commercial" },
  { code: "COMM2", name: "COMMERCIAL AETNA SAMPLE", cat: "commercial" },
  { code: "SELF", name: "SELF PAY SAMPLE", cat: "self_pay" },
  { code: "CHAR", name: "CHARITY CARE SAMPLE", cat: "charity" },
];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

type Scenario =
  | "zero_charge"
  | "admin_adj"
  | "charity"
  | "era_gap"
  | "pt_pay_eq"
  | "pt_pay_gt"
  | "ins_gt_charge"
  | "pt_gt_liability"
  | "medicaid_pt_pay"
  | "generic_credit"
  | "small_balance";

const SCENARIOS: Scenario[] = [
  "zero_charge",
  "admin_adj",
  "charity",
  "era_gap",
  "pt_pay_eq",
  "pt_pay_gt",
  "ins_gt_charge",
  "pt_gt_liability",
  "medicaid_pt_pay",
  "generic_credit",
  "small_balance",
];

function buildAccountFields(scenario: Scenario, i: number): Prisma.AccountCreateManyInput {
  const charges = money(500 + (i % 20) * 175 + (i % 7) * 33.25);
  const plan = pick(PLANS, i);
  const first = pick(FIRST, i);
  const last = pick(LAST, i * 3);
  const base = {
    firstName: first,
    lastName: last,
    medicalRecordNumber: `MRN${100000 + i}`,
    location: pick(LOCATIONS, i),
    patientType: pick(PATIENT_TYPES, i),
    admitDate: daysAgo(30 + (i % 90)),
    dischargeDate: daysAgo(20 + (i % 60)),
    planCode1: plan.code,
    primaryInsurance: plan.name,
    fileDate: daysAgo(i % 14),
  };

  switch (scenario) {
    case "zero_charge":
      return {
        ...base,
        totalBilledCharges: money(-(i % 3) * 50),
        patientAccountBalance: money(-150 - i * 3),
        totalNetPmts: 0,
        netPgp: 0,
        eraCharges: 0,
      };
    case "admin_adj":
      return {
        ...base,
        totalBilledCharges: charges,
        netAdminOtherAdj: money(-charges),
        patientAccountBalance: money(-charges),
        totalNetPmts: 0,
        eraCharges: charges,
        eraTotal: charges,
      };
    case "charity":
      return {
        ...base,
        totalBilledCharges: charges,
        charityWo: money(-charges),
        patientAccountBalance: money(-charges * 0.1),
        planCode1: "CHAR",
        primaryInsurance: "CHARITY CARE SAMPLE",
      };
    case "era_gap":
      return {
        ...base,
        totalBilledCharges: charges,
        eraCharges: money(charges * 0.72),
        patientAccountBalance: money(-(charges * 0.18)),
        totalNetPmts: money(-(charges * 0.55)),
        eraTotal: money(charges * 0.55),
      };
    case "pt_pay_eq": {
      const bal = money(-(80 + (i % 10) * 12.5));
      return {
        ...base,
        totalBilledCharges: charges,
        patientAccountBalance: bal,
        netPgp: bal,
        eraCharges: charges,
        ptRepEra: money(Math.abs(bal) + 50),
      };
    }
    case "pt_pay_gt":
      return {
        ...base,
        totalBilledCharges: money(400 + (i % 5) * 50),
        netPgp: money(-(500 + (i % 5) * 80)),
        patientAccountBalance: money(-(120 + i)),
        eraCharges: money(400 + (i % 5) * 50),
      };
    case "ins_gt_charge":
      return {
        ...base,
        totalBilledCharges: charges,
        totalNetPmts: money(-(charges * 1.25)),
        patientAccountBalance: money(-(charges * 0.25)),
        eraCharges: charges,
        planCode1: "COMM1",
        primaryInsurance: "COMMERCIAL BLUE SAMPLE",
      };
    case "pt_gt_liability":
      return {
        ...base,
        totalBilledCharges: charges,
        ptRepEra: money(100 + (i % 5) * 20),
        netPgp: money(-(200 + (i % 5) * 40)),
        patientAccountBalance: money(-(150 + i)),
        eraCharges: charges,
      };
    case "medicaid_pt_pay":
      return {
        ...base,
        totalBilledCharges: charges,
        netPgp: money(-(75 + (i % 8) * 10)),
        patientAccountBalance: money(-(200 + i * 2)),
        planCode1: "C95",
        primaryInsurance: "MEDICAID PLAN ALPHA",
        eraCharges: charges,
      };
    case "small_balance":
      return {
        ...base,
        totalBilledCharges: money(50 + (i % 5) * 10),
        patientAccountBalance: money(-(5 + (i % 4))),
        netPgp: 0,
        eraCharges: money(50 + (i % 5) * 10),
      };
    case "generic_credit":
    default:
      return {
        ...base,
        totalBilledCharges: charges,
        patientAccountBalance: money(-(25 + (i % 15) * 17.5)),
        totalNetPmts: money(-(charges * 0.6)),
        netContractualAdj: money(-(charges * 0.25)),
        netPgp: money(-(10 + (i % 6) * 5)),
        eraCharges: charges,
        eraTotal: money(charges * 0.6),
        secondaryInsurance: i % 4 === 0 ? "MEDICAID PLAN BETA" : null,
        planCode2: i % 4 === 0 ? "C72" : null,
      };
  }
}

async function wipeClientOperational(clientId: string) {
  // Order respects FKs without cascade surprises
  const accounts = await prisma.account.findMany({
    where: { clientId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);

  if (accountIds.length) {
    await prisma.ruleRunAccount.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await prisma.accountNote.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.changeHistory.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.transaction.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.clientAccountMap.updateMany({
      where: { clientId, accountId: { not: null } },
      data: { accountId: null },
    });
    await prisma.account.deleteMany({ where: { clientId } });
  }

  await prisma.ruleRun.deleteMany({
    where: { rulePack: { clientId } },
  });
  const rules = await prisma.rule.findMany({
    where: { rulePack: { clientId } },
    select: { id: true },
  });
  const ruleIds = rules.map((r) => r.id);
  if (ruleIds.length) {
    const groups = await prisma.ruleConditionGroup.findMany({
      where: { ruleId: { in: ruleIds } },
      select: { id: true },
    });
    const groupIds = groups.map((g) => g.id);
    if (groupIds.length) {
      await prisma.ruleCondition.deleteMany({ where: { groupId: { in: groupIds } } });
      await prisma.ruleConditionGroup.deleteMany({ where: { id: { in: groupIds } } });
    }
    await prisma.rule.deleteMany({ where: { id: { in: ruleIds } } });
  }
  await prisma.ruleSchedule.deleteMany({ where: { clientId } });
  await prisma.rulePack.deleteMany({ where: { clientId } });
  await prisma.workQueue.deleteMany({ where: { clientId } });
  await prisma.clientPayerMap.deleteMany({ where: { clientId } });
  await prisma.clientAccountMap.deleteMany({ where: { clientId } });
  await prisma.ruleValueListItem.deleteMany({
    where: { list: { clientId } },
  });
  await prisma.ruleValueList.deleteMany({ where: { clientId } });
  await prisma.clientRefundReason.deleteMany({ where: { clientId } });
}

async function seedHierarchy(
  clientId: string,
  byCode: Record<number, { id: string; name: string; code: number }>
) {
  const pack = await prisma.rulePack.create({
    data: {
      clientId,
      name: "Default hierarchy",
      description: "Mock hierarchy for credit balance classification",
    },
  });

  const rulesToCreate: Array<{
    rank: number;
    name: string;
    reasonCode: number;
    groups: Array<
      Array<{
        field: string;
        operator: RuleOperator;
        valueJson?: unknown;
        otherField?: string;
      }>
    >;
  }> = [
    {
      rank: 1,
      name: "Admin adj = 100% of charges",
      reasonCode: 12,
      groups: [
        [
          { field: "totalBilledCharges", operator: RuleOperator.GT, valueJson: 0 },
          {
            field: "totalBilledCharges",
            operator: RuleOperator.ABS_EQ_FIELD,
            otherField: "netAdminOtherAdj",
          },
        ],
      ],
    },
    {
      rank: 2,
      name: "Charity WO = charges",
      reasonCode: 13,
      groups: [
        [
          { field: "charityWo", operator: RuleOperator.NEQ, valueJson: 0 },
          {
            field: "charityWo",
            operator: RuleOperator.ABS_EQ_FIELD,
            otherField: "totalBilledCharges",
          },
        ],
      ],
    },
    {
      rank: 3,
      name: "$0 / negative charges",
      reasonCode: 2,
      groups: [[{ field: "totalBilledCharges", operator: RuleOperator.LTE, valueJson: 0 }]],
    },
    {
      rank: 4,
      name: "EMR > ERA charges",
      reasonCode: 3,
      groups: [
        [
          {
            field: "totalBilledCharges",
            operator: RuleOperator.GT_FIELD,
            otherField: "eraCharges",
          },
        ],
      ],
    },
    {
      rank: 5,
      name: "Patient pay equals credit balance",
      reasonCode: 8,
      groups: [
        [
          {
            field: "patientAccountBalance",
            operator: RuleOperator.ABS_EQ_FIELD,
            otherField: "netPgp",
          },
        ],
      ],
    },
    {
      rank: 6,
      name: "Patient payments >= total charges",
      reasonCode: 9,
      groups: [
        [
          { field: "netPgp", operator: RuleOperator.LT, valueJson: 0 },
          {
            field: "netPgp",
            operator: RuleOperator.ABS_GTE_FIELD,
            otherField: "totalBilledCharges",
          },
        ],
      ],
    },
    {
      rank: 7,
      name: "Medicaid (mapped) with patient payment",
      reasonCode: 14,
      groups: [
        [
          {
            field: "anyPayerCategory",
            operator: RuleOperator.IN,
            valueJson: ["medicaid"],
          },
          { field: "netPgp", operator: RuleOperator.ABS_GT, valueJson: 0 },
        ],
      ],
    },
    {
      rank: 8,
      name: "Unmapped primary payer — review",
      reasonCode: 1,
      groups: [
        [{ field: "payerUnmapped", operator: RuleOperator.EQ, valueJson: "true" }],
      ],
    },
  ];

  for (const r of rulesToCreate) {
    const reason = byCode[r.reasonCode];
    if (!reason) continue;
    const rule = await prisma.rule.create({
      data: {
        rulePackId: pack.id,
        name: r.name,
        hierarchyRank: r.rank,
        enabled: true,
        onlyUnclassified: true,
        targetRefundReasonId: reason.id,
      },
    });
    for (const [gi, conditions] of r.groups.entries()) {
      const group = await prisma.ruleConditionGroup.create({
        data: { ruleId: rule.id, sortOrder: gi },
      });
      for (const [ci, c] of conditions.entries()) {
        await prisma.ruleCondition.create({
          data: {
            groupId: group.id,
            field: c.field,
            operator: c.operator,
            valueJson: c.valueJson ?? undefined,
            otherField: c.otherField ?? null,
            sortOrder: ci,
          },
        });
      }
    }
    const existingQ = await prisma.workQueue.findUnique({
      where: {
        clientId_refundReasonId: { clientId, refundReasonId: reason.id },
      },
    });
    if (!existingQ) {
      await prisma.workQueue.create({
        data: {
          clientId,
          refundReasonId: reason.id,
          name: reason.name,
        },
      });
    }
  }

  await prisma.ruleSchedule.create({
    data: {
      clientId,
      rulePackId: pack.id,
      name: "Nightly hierarchy",
      cron: "0 2 * * *",
      timezone: "America/Chicago",
      enabled: false,
    },
  });

  return pack;
}

/**
 * Build a realistic patient ledger: charges → insurance pmt/adj → patient pmt.
 * ~1 in 8 accounts get an intentional anomaly for Overview testing.
 */
async function seedTransactionsForAccount(
  accountId: string,
  patientId: string,
  i: number,
  plan: { code: string; name: string; cat: string },
  fields: Prisma.AccountCreateManyInput
) {
  type Row = {
    source: "EHR" | "ERA_835";
    sortOrder: number;
    days: number;
    amount: number;
    transactionType: string;
    transactionDescription: string;
    postingCode: string;
    planCode?: string;
    planName?: string;
    claimAdjustmentGroupCode?: string;
    claimStatusCode?: number;
    payerClaimControlNumber?: string;
  };

  const totalCharges = Math.max(
    money(Number(fields.totalBilledCharges) || 0),
    250
  );
  // Use abs for zero/negative charge scenarios so we still post a plausible visit
  const chargeBase =
    totalCharges > 0 ? totalCharges : money(850 + (i % 12) * 75);

  const isMedicare = plan.cat === "medicare";
  const isMedicaid = plan.cat === "medicaid";
  const isSelfPay = plan.cat === "self_pay";
  const isCommercial = plan.cat === "commercial" || plan.cat === "government";
  const injectAnomaly = i % 8 === 0;

  // Allocate realistic amounts (commercial ~allowed 70%, contractual ~25%, pt ~5–20%)
  const contractualPct = isMedicare ? 0.28 : isMedicaid ? 0.35 : isSelfPay ? 0 : 0.22;
  const primaryPayPct = isSelfPay
    ? 0
    : isMedicare
      ? 0.55
      : isMedicaid
        ? 0.48
        : 0.58;
  const ptResponsibilityPct = isSelfPay
    ? 0.85
    : isMedicare
      ? 0.12
      : isMedicaid
        ? 0.05
        : 0.15;

  const roomCharge = money(chargeBase * (0.55 + (i % 5) * 0.02));
  const ancCharge = money(chargeBase - roomCharge);
  const contractual = money(-(chargeBase * contractualPct));
  const primaryPay = money(-(chargeBase * primaryPayPct));
  let patientPay = money(-(chargeBase * ptResponsibilityPct * (0.6 + (i % 4) * 0.1)));
  // Keep patient payment at least $25 when expected
  if (!isSelfPay && Math.abs(patientPay) < 25) patientPay = money(-40 - (i % 7) * 5);
  if (isSelfPay) patientPay = money(-(chargeBase * (0.4 + (i % 3) * 0.1)));

  const secondaryPay =
    fields.planCode2 && !isSelfPay
      ? money(-(chargeBase * 0.08))
      : 0;

  const adminAdj =
    i % 5 === 0 ? money(-(15 + (i % 4) * 5)) : 0; // small residual write-off

  const pcn = `CLM${patientId.replace(/\D/g, "").slice(-8) || i}${1000 + i}`;
  const rows: Row[] = [];
  let order = 1;

  const push = (r: Omit<Row, "sortOrder"> & { sortOrder?: number }) => {
    rows.push({ ...r, sortOrder: r.sortOrder ?? order++ });
  };

  // ─── EHR visit timeline ───────────────────────────────────────────────────
  // Day offsets: admit-ish → post charges → insurance → patient pays

  push({
    source: "EHR",
    days: 28,
    amount: roomCharge,
    transactionType: "Charge",
    transactionDescription: isSelfPay
      ? "HOSP ROOM & BOARD - SELF PAY"
      : "HOSP ROOM & BOARD",
    postingCode: "4500",
    planCode: plan.code,
    planName: plan.name,
  });

  if (ancCharge > 10) {
    push({
      source: "EHR",
      days: 28,
      amount: ancCharge,
      transactionType: "Charge",
      transactionDescription:
        i % 2 === 0 ? "LAB / ANCILLARY CHARGES" : "RADIOLOGY / PROC CHARGES",
      postingCode: "3000",
      planCode: plan.code,
      planName: plan.name,
    });
  }

  if (!isSelfPay && primaryPay !== 0) {
    push({
      source: "EHR",
      days: 18,
      amount: primaryPay,
      transactionType: "Payment",
      transactionDescription: isMedicare
        ? "MEDICARE PART A/B PAYMENT"
        : isMedicaid
          ? "MEDICAID REMITTANCE PAYMENT"
          : "PRIMARY INSURANCE PAYMENT",
      postingCode: "100",
      planCode: plan.code,
      planName: plan.name,
    });
  }

  if (!isSelfPay && contractual !== 0) {
    push({
      source: "EHR",
      days: 18,
      amount: contractual,
      transactionType: "Adjustment",
      transactionDescription: "CONTRACTUAL ALLOWANCE - PRIMARY",
      postingCode: "200",
      planCode: plan.code,
      planName: plan.name,
    });
  }

  if (secondaryPay !== 0 && fields.planCode2) {
    push({
      source: "EHR",
      days: 14,
      amount: secondaryPay,
      transactionType: "Payment",
      transactionDescription: "SECONDARY INSURANCE PAYMENT",
      postingCode: "105",
      planCode: String(fields.planCode2),
      planName: String(fields.secondaryInsurance || "SECONDARY PLAN"),
    });
  }

  // Patient payments (copay / statement / collection)
  push({
    source: "EHR",
    days: 10,
    amount: money(patientPay * 0.55),
    transactionType: "Payment",
    transactionDescription: isSelfPay
      ? "PATIENT PAYMENT - STATEMENT"
      : "PATIENT COPAY / DEDUCTIBLE",
    postingCode: "110",
    planCode: "SELF",
    planName: "SELF PAY",
  });

  push({
    source: "EHR",
    days: 6,
    amount: money(patientPay * 0.45),
    transactionType: "Payment",
    transactionDescription: "PATIENT PAYMENT - PORTAL / LOCKBOX",
    postingCode: "111",
    planCode: "SELF",
    planName: "SELF PAY",
  });

  if (adminAdj !== 0) {
    push({
      source: "EHR",
      days: 4,
      amount: adminAdj,
      transactionType: "Adjustment",
      transactionDescription: "SMALL BALANCE / ADMIN ADJUSTMENT",
      postingCode: "290",
      planCode: plan.code,
      planName: plan.name,
    });
  }

  // Credit-balance style overpayment sprinkle
  if (Number(fields.patientAccountBalance) < -50 && i % 3 === 1) {
    push({
      source: "EHR",
      days: 3,
      amount: money(Number(fields.patientAccountBalance) * 0.4),
      transactionType: "Payment",
      transactionDescription: "PATIENT OVERPAYMENT / DUPLICATE PMT",
      postingCode: "112",
      planCode: "SELF",
      planName: "SELF PAY",
    });
  }

  // ─── 835 remittance (insurance-side mirror; not patient payments) ─────────
  if (!isSelfPay) {
    push({
      source: "ERA_835",
      days: 17,
      amount: money(roomCharge + ancCharge),
      transactionType: "Charge",
      transactionDescription: "835 CLP CLAIM CHARGE AMOUNT",
      postingCode: "CLP",
      planCode: plan.code,
      planName: plan.name,
      claimStatusCode: 1,
      payerClaimControlNumber: pcn,
    });
    push({
      source: "ERA_835",
      days: 17,
      amount: primaryPay,
      transactionType: "Payment",
      transactionDescription: "835 BPR INSURANCE PAYMENT",
      postingCode: "BPR",
      planCode: plan.code,
      planName: plan.name,
      claimStatusCode: 1,
      payerClaimControlNumber: pcn,
    });
    push({
      source: "ERA_835",
      days: 17,
      amount: contractual,
      transactionType: "Adjustment",
      transactionDescription: "835 CAS CO CONTRACTUAL",
      postingCode: "CAS",
      planCode: plan.code,
      planName: plan.name,
      claimAdjustmentGroupCode: "CO",
      claimStatusCode: 1,
      payerClaimControlNumber: pcn,
    });
    // Patient responsibility on 835 as PR CAS (not a cash payment)
    const prAmt = money(Math.abs(patientPay) * 0.5);
    if (prAmt > 0) {
      push({
        source: "ERA_835",
        days: 17,
        amount: money(-prAmt),
        transactionType: "Adjustment",
        transactionDescription: "835 CAS PR PATIENT RESPONSIBILITY",
        postingCode: "CAS",
        planCode: plan.code,
        planName: plan.name,
        claimAdjustmentGroupCode: "PR",
        claimStatusCode: 1,
        payerClaimControlNumber: pcn,
      });
    }
  }

  // ─── Occasional anomaly overlays (still baselined with real activity) ─────
  if (injectAnomaly) {
    const kind = i % 3;
    if (kind === 0) {
      // Insurance payment with no corresponding charge on a separate line later — extra orphan pmt
      push({
        source: "EHR",
        days: 2,
        amount: money(-175 - (i % 5) * 10),
        transactionType: "Payment",
        transactionDescription: "INSURANCE PAYMENT - UNMATCHED POSTING",
        postingCode: "100",
        planCode: plan.code,
        planName: plan.name,
      });
    } else if (kind === 1) {
      push({
        source: "EHR",
        days: 2,
        amount: money(-(chargeBase * 0.15)),
        transactionType: "Adjustment",
        transactionDescription: "MISC ADJUSTMENT - NO LINKED CREDIT",
        postingCode: "299",
        planCode: plan.code,
        planName: plan.name,
      });
    } else {
      push({
        source: "EHR",
        days: 1,
        amount: money(-(chargeBase * 0.9)),
        transactionType: "Payment",
        transactionDescription: "PATIENT LARGE PAYMENT - DRIVES CREDIT",
        postingCode: "112",
        planCode: "SELF",
        planName: "SELF PAY",
      });
    }
  }

  // Chronological running total on combined list (by day desc = daysAgo larger first)
  const sorted = [...rows].sort((a, b) => {
    if (b.days !== a.days) return b.days - a.days; // older (higher daysAgo) first
    if (a.source !== b.source) return a.source === "EHR" ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });

  let running = 0;
  for (const r of sorted) {
    running = money(running + r.amount);
    await prisma.transaction.create({
      data: {
        accountId,
        source: r.source,
        planCode: r.planCode ?? plan.code,
        planName: r.planName ?? plan.name,
        postingCode: r.postingCode,
        postingDate: daysAgo(r.days),
        postingAmount: r.amount,
        transactionDescription: r.transactionDescription,
        transactionType: r.transactionType,
        receiptIdentification: `RCP-${patientId}-${r.source}-${r.sortOrder}`,
        claimAdjustmentGroupCode: r.claimAdjustmentGroupCode ?? null,
        claimStatusCode: r.claimStatusCode ?? null,
        payerClaimControlNumber: r.payerClaimControlNumber ?? null,
        runningTotal: running,
        sortOrder: r.sortOrder,
      },
    });
  }
}

async function seedClientBundle(opts: {
  tenantId: string;
  client: { id: string; code: string; name: string };
  byCode: Record<number, { id: string; name: string; code: number }>;
  statuses: Array<{ id: string; code: number }>;
  catByCode: Record<string, string>;
  accountCount: number;
  prefix: string;
}) {
  const { client, byCode, statuses, catByCode, accountCount, prefix } = opts;

  await wipeClientOperational(client.id);

  // Assign all reasons + queues seed via hierarchy
  for (const r of Object.values(byCode)) {
    await prisma.clientRefundReason.create({
      data: {
        clientId: client.id,
        refundReasonId: r.id,
        active: true,
      },
    });
  }

  // Payer maps for mock plans — leave COMM2 unmapped on purpose (coverage demos)
  await prisma.clientPayerMap.createMany({
    data: PLANS.filter((p) => p.code !== "COMM2").map((p) => ({
      clientId: client.id,
      sourcePlanCode: p.code,
      sourcePlanName: p.name,
      payerCategoryId: catByCode[p.cat],
      notes: "Mock seeded mapping",
    })),
  });

  // Value lists used by rules UI
  await prisma.ruleValueList.create({
    data: {
      clientId: client.id,
      name: "Medicaid plan codes",
      description: "Mock Medicaid code list",
      items: {
        create: PLANS.filter((p) => p.cat === "medicaid").map((p) => ({
          value: p.code,
        })),
      },
    },
  });
  await prisma.ruleValueList.create({
    data: {
      clientId: client.id,
      name: "Medicare plan codes",
      description: "Mock Medicare code list",
      items: {
        create: PLANS.filter((p) => p.cat === "medicare").map((p) => ({
          value: p.code,
        })),
      },
    },
  });

  await prisma.clientAccountMap.create({
    data: {
      clientId: client.id,
      sourceAccountKey: "109",
      excluded: true,
      notes: "System exclusion (mock)",
    },
  });
  await prisma.clientAccountMap.create({
    data: {
      clientId: client.id,
      sourceAccountKey: "TEST-SKIP",
      excluded: true,
      tag: "test",
      notes: "Test account key",
    },
  });

  await seedHierarchy(client.id, byCode);

  const openStatus = statuses.find((s) => s.code === 1);
  const inProg = statuses.find((s) => s.code === 2);

  // Create accounts
  for (let i = 1; i <= accountCount; i++) {
    const scenario = pick(SCENARIOS, i - 1);
    const patientId = `${prefix}${String(1000 + i)}`;
    const fields = buildAccountFields(scenario, i);

    // Pre-assign some accounts so queues aren't empty before hierarchy run
    let refundReasonId: string | null = null;
    let refundStatusId: string | null = null;
    if (i % 7 === 0) {
      refundReasonId = byCode[2]?.id ?? null;
      refundStatusId = openStatus?.id ?? null;
    } else if (i % 11 === 0) {
      refundReasonId = byCode[12]?.id ?? null;
      refundStatusId = inProg?.id ?? null;
    }

    const account = await prisma.account.create({
      data: {
        clientId: client.id,
        patientId,
        accountNumber: patientId,
        refundReasonId,
        refundStatusId,
        ...fields,
      },
    });

    // EHR + 835 mock transactions (includes anomaly patterns for Overview)
    const plan =
      PLANS.find((p) => p.code === fields.planCode1) ?? pick(PLANS, i);
    await seedTransactionsForAccount(account.id, patientId, i, plan, fields);


    if (i % 5 === 0) {
      await prisma.accountNote.create({
        data: {
          accountId: account.id,
          body: `Mock analyst note for ${patientId}: reviewed credit balance scenario ${scenario}.`,
        },
      });
    }

    if (refundReasonId) {
      await prisma.changeHistory.create({
        data: {
          accountId: account.id,
          refundReasonId,
          refundStatusId,
          source: "seed",
          note: "Pre-assigned in mock seed",
          adjustmentAmount: fields.patientAccountBalance ?? 0,
        },
      });
    }
  }
}

async function main() {
  console.log("Seeding mock database...");

  const passwordHash = await bcrypt.hash("password123", 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { name: "Demo Health System", active: true },
    create: { name: "Demo Health System", slug: "demo" },
  });

  // Second tenant so multi-tenant UI can be tested later
  const tenantB = await prisma.tenant.upsert({
    where: { slug: "northstar" },
    update: { name: "Northstar Care Network", active: true },
    create: { name: "Northstar Care Network", slug: "northstar" },
  });

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@demo.local" } },
    update: { passwordHash, role: "TENANT_ADMIN", active: true },
    create: {
      tenantId: tenant.id,
      email: "admin@demo.local",
      passwordHash,
      firstName: "Dana",
      lastName: "Admin",
      role: "TENANT_ADMIN",
    },
  });

  const analyst = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "analyst@demo.local" } },
    update: { passwordHash, role: "ANALYST", active: true },
    create: {
      tenantId: tenant.id,
      email: "analyst@demo.local",
      passwordHash,
      firstName: "Alex",
      lastName: "Analyst",
      role: "ANALYST",
    },
  });

  const clientAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "clientadmin@demo.local" } },
    update: { passwordHash, role: "CLIENT_ADMIN", active: true },
    create: {
      tenantId: tenant.id,
      email: "clientadmin@demo.local",
      passwordHash,
      firstName: "Chris",
      lastName: "Manager",
      role: "CLIENT_ADMIN",
    },
  });

  const northAdmin = await prisma.user.upsert({
    where: {
      tenantId_email: { tenantId: tenantB.id, email: "admin@northstar.local" },
    },
    update: { passwordHash, role: "TENANT_ADMIN", active: true },
    create: {
      tenantId: tenantB.id,
      email: "admin@northstar.local",
      passwordHash,
      firstName: "Nora",
      lastName: "North",
      role: "TENANT_ADMIN",
    },
  });

  for (const [i, r] of REASONS.entries()) {
    await prisma.refundReason.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: r.code } },
      update: { name: r.name, active: true, sortOrder: i },
      create: {
        tenantId: tenant.id,
        code: r.code,
        name: r.name,
        sortOrder: i,
      },
    });
    await prisma.refundReason.upsert({
      where: { tenantId_code: { tenantId: tenantB.id, code: r.code } },
      update: { name: r.name, active: true, sortOrder: i },
      create: {
        tenantId: tenantB.id,
        code: r.code,
        name: r.name,
        sortOrder: i,
      },
    });
  }

  for (const [i, s] of STATUSES.entries()) {
    for (const tid of [tenant.id, tenantB.id]) {
      await prisma.refundStatus.upsert({
        where: { tenantId_code: { tenantId: tid, code: s.code } },
        update: { name: s.name },
        create: {
          tenantId: tid,
          code: s.code,
          name: s.name,
          sortOrder: i,
        },
      });
    }
  }

  for (const c of PAYER_CATS) {
    for (const tid of [tenant.id, tenantB.id]) {
      await prisma.payerCategory.upsert({
        where: { tenantId_code: { tenantId: tid, code: c.code } },
        update: { name: c.name },
        create: { tenantId: tid, code: c.code, name: c.name },
      });
    }
  }

  const clientsSpec = [
    { tenantId: tenant.id, name: "Main Campus", code: "MAIN", prefix: "A", count: 48 },
    { tenantId: tenant.id, name: "North Wing", code: "NORTH", prefix: "N", count: 28 },
    { tenantId: tenant.id, name: "East Clinic", code: "EAST", prefix: "E", count: 18 },
    {
      tenantId: tenantB.id,
      name: "Northstar Hospital",
      code: "NSH",
      prefix: "NS",
      count: 22,
    },
  ];

  const createdClients: Array<{ id: string; code: string; name: string; tenantId: string }> =
    [];

  for (const spec of clientsSpec) {
    const client = await prisma.client.upsert({
      where: {
        tenantId_code: { tenantId: spec.tenantId, code: spec.code },
      },
      update: { name: spec.name, active: true },
      create: {
        tenantId: spec.tenantId,
        name: spec.name,
        code: spec.code,
      },
    });
    createdClients.push({ ...client, tenantId: spec.tenantId });

    const reasons = await prisma.refundReason.findMany({
      where: { tenantId: spec.tenantId },
    });
    const byCode = Object.fromEntries(reasons.map((r) => [r.code, r]));
    const statuses = await prisma.refundStatus.findMany({
      where: { tenantId: spec.tenantId },
    });
    const cats = await prisma.payerCategory.findMany({
      where: { tenantId: spec.tenantId },
    });
    const catByCode = Object.fromEntries(cats.map((c) => [c.code, c.id]));

    await seedClientBundle({
      tenantId: spec.tenantId,
      client,
      byCode,
      statuses,
      catByCode,
      accountCount: spec.count,
      prefix: spec.prefix,
    });
  }

  // User → client access
  const main = createdClients.find((c) => c.code === "MAIN")!;
  const north = createdClients.find((c) => c.code === "NORTH")!;
  const east = createdClients.find((c) => c.code === "EAST")!;
  const nsh = createdClients.find((c) => c.code === "NSH")!;

  for (const c of [main, north, east]) {
    await prisma.userClientAccess.upsert({
      where: { userId_clientId: { userId: admin.id, clientId: c.id } },
      update: {},
      create: { userId: admin.id, clientId: c.id },
    });
  }
  await prisma.userClientAccess.upsert({
    where: { userId_clientId: { userId: analyst.id, clientId: main.id } },
    update: {},
    create: { userId: analyst.id, clientId: main.id },
  });
  await prisma.userClientAccess.upsert({
    where: { userId_clientId: { userId: clientAdmin.id, clientId: north.id } },
    update: {},
    create: { userId: clientAdmin.id, clientId: north.id },
  });
  await prisma.userClientAccess.upsert({
    where: { userId_clientId: { userId: northAdmin.id, clientId: nsh.id } },
    update: {},
    create: { userId: northAdmin.id, clientId: nsh.id },
  });

  const accountTotal = await prisma.account.count();
  const txnTotal = await prisma.transaction.count();

  console.log("Mock seed complete");
  console.log("─────────────────────────────────────");
  console.log(`  Accounts:     ${accountTotal}`);
  console.log(`  Transactions: ${txnTotal}`);
  console.log(`  Clients:      ${createdClients.length}`);
  console.log("");
  console.log("  Demo tenant slug: demo");
  console.log("    admin@demo.local / password123       (TENANT_ADMIN)");
  console.log("    analyst@demo.local / password123     (ANALYST · Main Campus)");
  console.log("    clientadmin@demo.local / password123 (CLIENT_ADMIN · North Wing)");
  console.log("");
  console.log("  Second tenant slug: northstar");
  console.log("    admin@northstar.local / password123  (TENANT_ADMIN)");
  console.log("─────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
