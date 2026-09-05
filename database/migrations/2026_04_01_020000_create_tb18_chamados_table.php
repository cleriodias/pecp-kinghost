<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('tb18_chamados', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->foreignId('unit_id')
                ->nullable()
                ->constrained('tb2_unidades', 'tb2_id')
                ->nullOnDelete();
            $table->string('title', 160);
            $table->text('description')->nullable();
            $table->string('video_path', 255);
            $table->string('video_original_name', 255);
            $table->string('video_mime_type', 120);
            $table->unsignedBigInteger('video_size')->default(0);
            $table->string('status', 30)->default('aberto');
            $table->timestamps();

            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tb18_chamados');
    }
};
