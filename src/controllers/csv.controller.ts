import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { CSVImportService, CSVExportService } from '../services/csvService';
import { schemas } from '../schemas';
import { logger } from '../utils/logger';
import { ValidationError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

/**
 * CSV Controller for Import/Export operations
 */
export class CSVController {
  /**
   * Import expenses from CSV file
   */
  static async importExpenses(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'Arquivo CSV não fornecido',
        } as ApiResponse);
        return;
      }

      // Validate CSV import mapping
      const validation = schemas.csvImport.safeParse(req.body);
      
      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: 'Mapeamento de campos inválido',
          errors: validation.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        } as ApiResponse);
        return;
      }

      const mapping = validation.data;

      // Get default payer for user
      const defaultPayer = await prisma.payer.findFirst({
        where: { userId, active: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!defaultPayer) {
        res.status(400).json({
          success: false,
          message: 'Nenhum pagador ativo encontrado. Crie um pagador antes de importar despesas.',
        } as ApiResponse);
        return;
      }

      // Process CSV import
      const result = await CSVImportService.importExpenses(
        req.file.buffer,
        mapping,
        userId,
        defaultPayer.id
      );

      const statusCode = result.success ? 200 : 400;

      logger.info('CSV import request processed', {
        userId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        result: {
          success: result.success,
          importedCount: result.importedCount,
          errorCount: result.errorCount,
        },
      });

      res.status(statusCode).json({
        success: result.success,
        message: result.success 
          ? `Importação concluída! ${result.importedCount} despesas importadas${result.errorCount > 0 ? ` com ${result.errorCount} erros` : ''}.`
          : 'Falha na importação. Verifique os erros e tente novamente.',
        data: {
          importedCount: result.importedCount,
          errorCount: result.errorCount,
          errors: result.errors,
          preview: result.preview,
        },
      } as ApiResponse);

    } catch (error) {
      logger.error('CSV import error', error as Error, {
        userId: req.user?.id,
        filename: req.file?.originalname,
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno durante a importação',
      } as ApiResponse);
    }
  }

  /**
   * Export expenses to CSV
   */
  static async exportExpenses(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Parse export filters
      const {
        startDate,
        endDate,
        categoryId,
        payerId,
        type,
        status,
        includePayments = 'true',
        includeSplits = 'false',
        format = 'expenses',
      } = req.query;

      // Build filters
      const filters: any = {};

      if (startDate) {
        filters.startDate = new Date(startDate as string);
      }

      if (endDate) {
        filters.endDate = new Date(endDate as string);
      }

      if (categoryId) {
        // Verify category belongs to user
        const category = await prisma.category.findFirst({
          where: { id: categoryId as string, userId },
        });

        if (!category) {
          res.status(400).json({
            success: false,
            message: 'Categoria não encontrada',
          } as ApiResponse);
          return;
        }

        filters.categoryId = categoryId as string;
      }

      if (type) {
        const types = Array.isArray(type) ? type : [type];
        filters.type = types;
      }

      if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        filters.status = statuses;
      }

      // Generate CSV based on format
      let csvContent: string;
      let filename: string;

      if (format === 'payments') {
        csvContent = await CSVExportService.exportPayments(userId, filters);
        filename = `pagamentos_${new Date().toISOString().split('T')[0]}.csv`;
      } else {
        const exportOptions = {
          userId,
          filters,
          includePayments: includePayments === 'true',
          includeSplits: includeSplits === 'true',
        };

        csvContent = await CSVExportService.exportExpenses(exportOptions);
        filename = `despesas_${new Date().toISOString().split('T')[0]}.csv`;
      }

      // Set response headers for file download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Add BOM for Excel compatibility
      const bom = '\uFEFF';
      
      logger.info('CSV export completed', {
        userId,
        format,
        filename,
        filters,
      });

      res.send(bom + csvContent);

    } catch (error) {
      logger.error('CSV export error', error as Error, {
        userId: req.user?.id,
        query: req.query,
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno durante a exportação',
      } as ApiResponse);
    }
  }

  /**
   * Download CSV import template
   */
  static async downloadTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Generate template CSV
      const csvContent = CSVExportService.generateImportTemplate();
      const filename = 'template_importacao_despesas.csv';

      // Set response headers for file download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Add BOM for Excel compatibility
      const bom = '\uFEFF';

      logger.info('CSV template downloaded', { userId });

      res.send(bom + csvContent);

    } catch (error) {
      logger.error('CSV template download error', error as Error, {
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao gerar template',
      } as ApiResponse);
    }
  }

  /**
   * Preview CSV file before import
   */
  static async previewCSV(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'Arquivo CSV não fornecido',
        } as ApiResponse);
        return;
      }

      // Parse CSV for preview
      const { data, errors } = await CSVImportService.parseCSV(req.file.buffer);

      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Erro ao processar arquivo CSV',
          errors: errors.map((error, index) => ({
            row: index + 1,
            message: error.message,
          })),
        } as ApiResponse);
        return;
      }

      if (data.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Arquivo CSV vazio',
        } as ApiResponse);
        return;
      }

      // Get headers and validate
      const headers = Object.keys(data[0]);
      const headerValidation = CSVImportService.validateHeaders(headers);

      // Preview first 10 rows
      const preview = data.slice(0, 10);

      logger.info('CSV preview generated', {
        userId,
        filename: req.file.originalname,
        rowCount: data.length,
        headerCount: headers.length,
      });

      res.json({
        success: true,
        data: {
          headers,
          preview,
          totalRows: data.length,
          validation: {
            isValid: headerValidation.isValid,
            missingHeaders: headerValidation.missing,
          },
        },
      } as ApiResponse);

    } catch (error) {
      logger.error('CSV preview error', error as Error, {
        userId: req.user?.id,
        filename: req.file?.originalname,
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao processar preview',
      } as ApiResponse);
    }
  }

  /**
   * Get import/export statistics
   */
  static async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Get user statistics
      const [totalExpenses, totalCategories, totalPayers, recentExpenses] = await Promise.all([
        prisma.expense.count({
          where: { userId, active: true },
        }),
        prisma.category.count({
          where: { userId },
        }),
        prisma.payer.count({
          where: { userId, active: true },
        }),
        prisma.expense.count({
          where: {
            userId,
            active: true,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        }),
      ]);

      const stats = {
        totalExpenses,
        totalCategories,
        totalPayers,
        recentExpenses,
        recommendations: {
          maxImportRows: 1000,
          supportedFormats: ['CSV'],
          requiredFields: ['description', 'supplier', 'amount', 'category'],
          optionalFields: ['dueDate', 'type', 'buyer', 'notes', 'startDate'],
        },
      };

      res.json({
        success: true,
        data: stats,
      } as ApiResponse);

    } catch (error) {
      logger.error('CSV stats error', error as Error, {
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao obter estatísticas',
      } as ApiResponse);
    }
  }
}

export default CSVController;import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { CSVImportService, CSVExportService } from '../services/csvService';
import { schemas } from '../schemas';
import { logger } from '../utils/logger';
import { ValidationError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

/**
 * CSV Controller for Import/Export operations
 */
export class CSVController {
  /**
   * Import expenses from CSV file
   */
  static async importExpenses(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'Arquivo CSV não fornecido',
        } as ApiResponse);
        return;
      }

      // Validate CSV import mapping
      const validation = schemas.csvImport.safeParse(req.body);
      
      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: 'Mapeamento de campos inválido',
          errors: validation.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        } as ApiResponse);
        return;
      }

      const mapping = validation.data;

      // Get default payer for user
      const defaultPayer = await prisma.payer.findFirst({
        where: { userId, active: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!defaultPayer) {
        res.status(400).json({
          success: false,
          message: 'Nenhum pagador ativo encontrado. Crie um pagador antes de importar despesas.',
        } as ApiResponse);
        return;
      }

      // Process CSV import
      const result = await CSVImportService.importExpenses(
        req.file.buffer,
        mapping,
        userId,
        defaultPayer.id
      );

      const statusCode = result.success ? 200 : 400;

      logger.info('CSV import request processed', {
        userId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        result: {
          success: result.success,
          importedCount: result.importedCount,
          errorCount: result.errorCount,
        },
      });

      res.status(statusCode).json({
        success: result.success,
        message: result.success 
          ? `Importação concluída! ${result.importedCount} despesas importadas${result.errorCount > 0 ? ` com ${result.errorCount} erros` : ''}.`
          : 'Falha na importação. Verifique os erros e tente novamente.',
        data: {
          importedCount: result.importedCount,
          errorCount: result.errorCount,
          errors: result.errors,
          preview: result.preview,
        },
      } as ApiResponse);

    } catch (error) {
      logger.error('CSV import error', error as Error, {
        userId: req.user?.id,
        filename: req.file?.originalname,
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno durante a importação',
      } as ApiResponse);
    }
  }

  /**
   * Export expenses to CSV
   */
  static async exportExpenses(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Parse export filters
      const {
        startDate,
        endDate,
        categoryId,
        payerId,
        type,
        status,
        includePayments = 'true',
        includeSplits = 'false',
        format = 'expenses',
      } = req.query;

      // Build filters
      const filters: any = {};

      if (startDate) {
        filters.startDate = new Date(startDate as string);
      }

      if (endDate) {
        filters.endDate = new Date(endDate as string);
      }

      if (categoryId) {
        // Verify category belongs to user
        const category = await prisma.category.findFirst({
          where: { id: categoryId as string, userId },
        });

        if (!category) {
          res.status(400).json({
            success: false,
            message: 'Categoria não encontrada',
          } as ApiResponse);
          return;
        }

        filters.categoryId = categoryId as string;
      }

      if (type) {
        const types = Array.isArray(type) ? type : [type];
        filters.type = types;
      }

      if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        filters.status = statuses;
      }

      // Generate CSV based on format
      let csvContent: string;
      let filename: string;

      if (format === 'payments') {
        csvContent = await CSVExportService.exportPayments(userId, filters);
        filename = `pagamentos_${new Date().toISOString().split('T')[0]}.csv`;
      } else {
        const exportOptions = {
          userId,
          filters,
          includePayments: includePayments === 'true',
          includeSplits: includeSplits === 'true',
        };

        csvContent = await CSVExportService.exportExpenses(exportOptions);
        filename = `despesas_${new Date().toISOString().split('T')[0]}.csv`;
      }

      // Set response headers for file download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Add BOM for Excel compatibility
      const bom = '\uFEFF';
      
      logger.info('CSV export completed', {
        userId,
        format,
        filename,
        filters,
      });

      res.send(bom + csvContent);

    } catch (error) {
      logger.error('CSV export error', error as Error, {
        userId: req.user?.id,
        query: req.query,
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno durante a exportação',
      } as ApiResponse);
    }
  }

  /**
   * Download CSV import template
   */
  static async downloadTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Generate template CSV
      const csvContent = CSVExportService.generateImportTemplate();
      const filename = 'template_importacao_despesas.csv';

      // Set response headers for file download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Add BOM for Excel compatibility
      const bom = '\uFEFF';

      logger.info('CSV template downloaded', { userId });

      res.send(bom + csvContent);

    } catch (error) {
      logger.error('CSV template download error', error as Error, {
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao gerar template',
      } as ApiResponse);
    }
  }

  /**
   * Preview CSV file before import
   */
  static async previewCSV(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'Arquivo CSV não fornecido',
        } as ApiResponse);
        return;
      }

      // Parse CSV for preview
      const { data, errors } = await CSVImportService.parseCSV(req.file.buffer);

      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Erro ao processar arquivo CSV',
          errors: errors.map((error, index) => ({
            row: index + 1,
            message: error.message,
          })),
        } as ApiResponse);
        return;
      }

      if (data.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Arquivo CSV vazio',
        } as ApiResponse);
        return;
      }

      // Get headers and validate
      const headers = Object.keys(data[0]);
      const headerValidation = CSVImportService.validateHeaders(headers);

      // Preview first 10 rows
      const preview = data.slice(0, 10);

      logger.info('CSV preview generated', {
        userId,
        filename: req.file.originalname,
        rowCount: data.length,
        headerCount: headers.length,
      });

      res.json({
        success: true,
        data: {
          headers,
          preview,
          totalRows: data.length,
          validation: {
            isValid: headerValidation.isValid,
            missingHeaders: headerValidation.missing,
          },
        },
      } as ApiResponse);

    } catch (error) {
      logger.error('CSV preview error', error as Error, {
        userId: req.user?.id,
        filename: req.file?.originalname,
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao processar preview',
      } as ApiResponse);
    }
  }

  /**
   * Get import/export statistics
   */
  static async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Get user statistics
      const [totalExpenses, totalCategories, totalPayers, recentExpenses] = await Promise.all([
        prisma.expense.count({
          where: { userId, active: true },
        }),
        prisma.category.count({
          where: { userId },
        }),
        prisma.payer.count({
          where: { userId, active: true },
        }),
        prisma.expense.count({
          where: {
            userId,
            active: true,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        }),
      ]);

      const stats = {
        totalExpenses,
        totalCategories,
        totalPayers,
        recentExpenses,
        recommendations: {
          maxImportRows: 1000,
          supportedFormats: ['CSV'],
          requiredFields: ['description', 'supplier', 'amount', 'category'],
          optionalFields: ['dueDate', 'type', 'buyer', 'notes', 'startDate'],
        },
      };

      res.json({
        success: true,
        data: stats,
      } as ApiResponse);

    } catch (error) {
      logger.error('CSV stats error', error as Error, {
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao obter estatísticas',
      } as ApiResponse);
    }
  }
}

export default CSVController;