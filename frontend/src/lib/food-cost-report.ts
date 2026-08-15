import api from './api';

export type FoodCostRecipeLine = {
  recipe_id: string;
  recipe_name: string;
  menu_product_id: string;
  consumption_count: number;
  theoretical_cogs_cents: number;
  insufficient_line_count: number;
};

export type FoodCostPayload = {
  startDate: string;
  endDate: string;
  net_sales: number;
  theoretical_cogs_cents: number;
  food_cost_percent: number | null;
  insufficient_line_count: number;
  consumption_count: number;
  by_recipe: FoodCostRecipeLine[];
};

export async function fetchFoodCostReport(
  startDate: string,
  endDate: string,
): Promise<FoodCostPayload> {
  const res = await api.get<{ foodCost: FoodCostPayload }>('/reports/food-cost', {
    params: { start_date: startDate, end_date: endDate },
  });
  return res.data.foodCost;
}
