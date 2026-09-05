<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class NewsletterNotice extends Model
{
    use HasFactory;

    protected $fillable = [
        'newsletter_subscription_id',
        'name',
        'phone',
        'message',
    ];
}
