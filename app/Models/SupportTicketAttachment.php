<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportTicketAttachment extends Model
{
    use HasFactory;

    protected $table = 'tb20_chamado_anexos';

    protected $fillable = [
        'support_ticket_interaction_id',
        'file_path',
        'original_name',
        'mime_type',
        'file_size',
    ];

    protected $casts = [
        'support_ticket_interaction_id' => 'integer',
        'file_size' => 'integer',
    ];

    public function interaction(): BelongsTo
    {
        return $this->belongsTo(SupportTicketInteraction::class, 'support_ticket_interaction_id');
    }
}
