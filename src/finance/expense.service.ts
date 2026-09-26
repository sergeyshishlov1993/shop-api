import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryExpensesDto) {
    const { type, dateFrom, dateTo, page = 1, limit = 20 } = query;

    const where: Prisma.ExpenseWhereInput = {};

    if (type) {
      where.type = type;
    }

    if (dateFrom || dateTo) {
      where.expenseDate = {};
      if (dateFrom) {
        where.expenseDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.expenseDate.lte = new Date(dateTo);
      }
    }

    const [items, totalCount] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { expenseDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      items,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  async create(dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        title: dto.title,
        type: dto.type,
        amount: dto.amount,
        expenseDate: new Date(dto.expenseDate),
        note: dto.note,
      },
    });
  }

  async update(expenseId: number, dto: UpdateExpenseDto) {
    await this.findOneOrFail(expenseId);

    const data: Prisma.ExpenseUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.expenseDate !== undefined) data.expenseDate = new Date(dto.expenseDate);
    if (dto.note !== undefined) data.note = dto.note;

    return this.prisma.expense.update({
      where: { id: expenseId },
      data,
    });
  }

  async remove(expenseId: number) {
    await this.findOneOrFail(expenseId);

    return this.prisma.expense.delete({
      where: { id: expenseId },
    });
  }

  private async findOneOrFail(expenseId: number) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
    });

    if (!expense) {
      throw new NotFoundException(`Expense #${expenseId} not found`);
    }

    return expense;
  }
}
