/**
 * R5 — Recipe / BOM HTTP routes (`/api/recipes/*`).
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { validateBody } from '../middleware/validate';
import {
  computeRecipeCostForId,
  createRecipe,
  getRecipe,
  listRecipeIngredients,
  listRecipes,
  RecipeServiceError,
  replaceRecipeIngredients,
  setRecipeActive,
  updateRecipe,
} from '../services/recipe';
import { listConsumptions } from '../services/recipe-consumption';
import { InventoryServiceError } from '../services/inventory';
import {
  recipeCreateBodySchema,
  recipeIngredientsReplaceBodySchema,
  recipeUpdateBodySchema,
} from '../validation/recipe';
import { routeParam } from '../lib/route-params';

const router = Router();

function actorId(req: Request): string | null {
  return (req as any).user?.userId ?? (req as any).authUser?.userId ?? null;
}

function mapError(error: unknown, res: Response): boolean {
  if (error instanceof RecipeServiceError || error instanceof InventoryServiceError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  const status = (error as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 600) {
    res.status(status).json({ error: (error as Error).message || 'Request failed' });
    return true;
  }
  return false;
}

/** GET /api/recipes/consumptions — must be before /:id */
router.get('/consumptions', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const orderId = typeof req.query.order_id === 'string' ? req.query.order_id.trim() : undefined;
    const limitRaw = req.query.limit;
    const limit = limitRaw === undefined ? undefined : Number(limitRaw);
    const rows = listConsumptions({ orderId, limit });
    res.json({ consumptions: rows });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] recipe consumptions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', requireRole('owner', 'manager', 'chef'), (req: Request, res: Response) => {
  try {
    const productId =
      typeof req.query.product_id === 'string' ? req.query.product_id.trim() : undefined;
    const activeOnly = req.query.active === '1' || req.query.active === 'true';
    const recipes = listRecipes({ productId, activeOnly }).map((r) => ({
      ...r,
      ingredients: listRecipeIngredients(r.id),
    }));
    res.json({ recipes });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] list recipes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/cost', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const cost = computeRecipeCostForId(routeParam(req.params.id));
    res.json(cost);
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] recipe cost error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireRole('owner', 'manager', 'chef'), (req: Request, res: Response) => {
  try {
    const recipe = getRecipe(routeParam(req.params.id));
    const ingredients = listRecipeIngredients(recipe.id);
    res.json({ recipe, ingredients });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    console.error('[API] get recipe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  requireRole('owner', 'manager'),
  validateBody(recipeCreateBodySchema),
  (req: Request, res: Response) => {
    try {
      const body = req.body as {
        product_id: string;
        name: string;
        yield_qty?: number;
        yield_unit?: string;
        is_active?: boolean;
        ingredients?: Array<{
          ingredient_product_id: string;
          quantity: number;
          unit: string;
          prep_loss_bps?: number;
          position?: number;
        }>;
      };
      const recipe = createRecipe({
        productId: body.product_id,
        name: body.name,
        yieldQty: body.yield_qty,
        yieldUnit: body.yield_unit,
        isActive: body.is_active,
        ingredients: body.ingredients,
        actorUserId: actorId(req),
      });
      res.status(201).json({
        recipe,
        ingredients: listRecipeIngredients(recipe.id),
      });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] create recipe error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.patch(
  '/:id',
  requireRole('owner', 'manager'),
  validateBody(recipeUpdateBodySchema),
  (req: Request, res: Response) => {
    try {
      const body = req.body as {
        name?: string;
        yield_qty?: number;
        yield_unit?: string;
      };
      const recipe = updateRecipe(routeParam(req.params.id), {
        name: body.name,
        yieldQty: body.yield_qty,
        yieldUnit: body.yield_unit,
        actorUserId: actorId(req),
      });
      res.json({ recipe, ingredients: listRecipeIngredients(recipe.id) });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] update recipe error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post('/:id/activate', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const recipe = setRecipeActive(routeParam(req.params.id), true, actorId(req));
    res.json({ recipe });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/deactivate', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const recipe = setRecipeActive(routeParam(req.params.id), false, actorId(req));
    res.json({ recipe });
  } catch (error: unknown) {
    if (mapError(error, res)) return;
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put(
  '/:id/ingredients',
  requireRole('owner', 'manager'),
  validateBody(recipeIngredientsReplaceBodySchema),
  (req: Request, res: Response) => {
    try {
      const body = req.body as {
        ingredients: Array<{
          ingredient_product_id: string;
          quantity: number;
          unit: string;
          prep_loss_bps?: number;
          position?: number;
        }>;
      };
      const ingredients = replaceRecipeIngredients(
        routeParam(req.params.id),
        body.ingredients,
        actorId(req),
      );
      res.json({ ingredients });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] replace ingredients error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export const recipeRoutes = router;
