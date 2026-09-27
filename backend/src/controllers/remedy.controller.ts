import { Request, Response } from 'express';
import { Remedy } from '../models/Remedy.js';

export const getRemedies = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.query;
    const filter = category ? { category: String(category).toLowerCase().trim() } : {};

    const remedies = await Remedy.find(filter).sort({ createdAt: -1 });

    // Format response to ensure both `id` and `_id` are available
    const formatted = remedies.map((doc) => {
      const obj = doc.toObject();
      return {
        ...obj,
        id: obj._id.toString(),
      };
    });

    res.json({
      status: 'success',
      count: formatted.length,
      data: formatted,
    });
  } catch (error: any) {
    console.error('Error fetching remedies:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch remedies',
    });
  }
};

export const getRemedyById = async (req: Request, res: Response): Promise<void> => {
  try {
    const remedy = await Remedy.findById(req.params.id);
    if (!remedy) {
      res.status(404).json({
        status: 'error',
        message: 'Remedy not found',
      });
      return;
    }

    const obj = remedy.toObject();
    res.json({
      status: 'success',
      data: { ...obj, id: obj._id.toString() },
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch remedy',
    });
  }
};

export const createRemedy = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      category,
      excerpt,
      description,
      imageUrl,
      symptoms,
      uses,
      precautions,
      dosage,
      preparation,
      variety,
      habitat,
      lifespan,
      notes,
      status,
      addedBy,
      addedOn,
    } = req.body;

    if (!name || !category || !description) {
      res.status(400).json({
        status: 'error',
        message: 'Name, category, and description are required.',
      });
      return;
    }

    const newRemedy = await Remedy.create({
      name: name.trim(),
      category: category.trim().toLowerCase(),
      excerpt: excerpt?.trim() || '',
      description: description.trim(),
      imageUrl: imageUrl?.trim() || '',
      symptoms: Array.isArray(symptoms) ? symptoms : symptoms ? [symptoms] : [],
      uses: Array.isArray(uses) ? uses : uses ? [uses] : [],
      precautions: precautions?.trim() || '',
      dosage: dosage?.trim() || '',
      preparation: preparation?.trim() || '',
      variety: variety?.trim() || '',
      habitat: habitat?.trim() || '',
      lifespan: lifespan?.trim() || '',
      notes: notes?.trim() || '',
      status: status || 'Draft',
      addedBy: addedBy || 'Admin',
      addedOn: addedOn || undefined,
    });

    const obj = newRemedy.toObject();
    res.status(201).json({
      status: 'success',
      data: { ...obj, id: obj._id.toString() },
    });
  } catch (error: any) {
    console.error('Error creating remedy:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create remedy',
    });
  }
};

export const updateRemedy = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const remedy = await Remedy.findById(id);

    if (!remedy) {
      res.status(404).json({
        status: 'error',
        message: 'Remedy not found',
      });
      return;
    }

    const updated = await Remedy.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });

    if (!updated) {
      res.status(404).json({
        status: 'error',
        message: 'Remedy not found',
      });
      return;
    }

    const obj = updated.toObject();
    res.json({
      status: 'success',
      data: { ...obj, id: obj._id.toString() },
    });
  } catch (error: any) {
    console.error('Error updating remedy:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update remedy',
    });
  }
};

export const deleteRemedy = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await Remedy.findByIdAndDelete(id);

    if (!deleted) {
      res.status(404).json({
        status: 'error',
        message: 'Remedy not found',
      });
      return;
    }

    res.json({
      status: 'success',
      message: 'Remedy deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting remedy:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete remedy',
    });
  }
};
