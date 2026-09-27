import { RemedyCategoryConfig } from "./RemedyCategoryView";

export const REMEDY_CONFIGS: Record<string, RemedyCategoryConfig> = {
  herbs: {
    slug: "herbs",
    title: "Herbs",
    singularName: "Herb",
    pluralName: "Herbs",
    subtitle: "Manage herbal medicines, their symptoms and verification status.",
  },
  allopathic: {
    slug: "allopathic",
    title: "Allopathic",
    singularName: "Allopathic",
    pluralName: "Allopathic",
    subtitle: "Manage allopathic medicines, their symptoms and verification status.",
  },
  homeopathy: {
    slug: "homeopathy",
    title: "Homeopathy",
    singularName: "Homeopathy",
    pluralName: "Homeopathy",
    subtitle: "Manage homeopathic medicines, their symptoms and verification status.",
  },
  ayurveda: {
    slug: "ayurveda",
    title: "Ayurveda",
    singularName: "Ayurveda",
    pluralName: "Ayurveda",
    subtitle: "Manage ayurvedic formulations, their symptoms and verification status.",
  },
  oils: {
    slug: "oils",
    title: "Oils",
    singularName: "Oil",
    pluralName: "Oils",
    subtitle: "Manage therapeutic oils, their symptoms and verification status.",
  },
  flowers: {
    slug: "flowers",
    title: "Flowers",
    singularName: "Flower",
    pluralName: "Flowers",
    subtitle: "Manage flower remedies, their symptoms and verification status.",
  },
  supplements: {
    slug: "supplements",
    title: "Supplements",
    singularName: "Supplement",
    pluralName: "Supplements",
    subtitle: "Manage dietary supplements, their symptoms and verification status.",
  },
  "first-aid": {
    slug: "first-aid",
    title: "First Aid",
    singularName: "First Aid Item",
    pluralName: "First Aid",
    subtitle: "Manage first aid supplies, their symptoms and verification status.",
  },
  wellness: {
    slug: "wellness",
    title: "Wellness",
    singularName: "Wellness Remedy",
    pluralName: "Wellness",
    subtitle: "Manage holistic wellness products, their symptoms and verification status.",
  },
};
