export type CampaignLink = { label: string; url: string };

export type MarketingCampaign = {
  id: string;
  user_id: string;
  name: string;
  objective: string;
  audience: string;
  links: CampaignLink[];
  created_at: string;
  updated_at: string;
};

export type MarketingCampaignPatch = Partial<
  Pick<MarketingCampaign, "name" | "objective" | "audience" | "links">
>;

export type MarketingCampaignStats = {
  trackedLinks: number;
  clickedRecipients: number;
  totalClicks: number;
  dispatches: number;
};

export type MarketingCampaignWithStats = MarketingCampaign & { stats: MarketingCampaignStats };
