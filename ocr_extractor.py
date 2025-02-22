import sys
import pytesseract
from PIL import Image

# Função para recortar a imagem
def recortar_imagem(imagem_path, dpi=300):
    # Abre a imagem
    img = Image.open(imagem_path)
    
    # Definindo os parâmetros de recorte
    altura_cm = 0.6  # Altura do recorte (em cm)
    pular_cm = 3  # Pular 2 cm do topo
    esquerda_cm = 4.5  # Recortar 1 cm da esquerda
    direita_cm = 2  # Recortar 0,5 cm da direita
    
    # Calcula os valores em pixels
    pixels_pular = int(pular_cm * dpi / 2.54)
    pixels_recorte = int(altura_cm * dpi / 2.54)
    pixels_esquerda = int(esquerda_cm * dpi / 2.54)
    pixels_direita = int(direita_cm * dpi / 2.54)
    
    # Define as coordenadas do recorte
    largura, altura = img.size
    img_recortada = img.crop((pixels_esquerda, pixels_pular, largura - pixels_direita, pixels_pular + pixels_recorte))
    
    # Salvar para debug
    img_recortada.save("recorte.png")
    
    return img_recortada

def realizar_ocr(imagem_path):
    try:
        # Pré-processa a imagem
        img_processada = recortar_imagem(imagem_path)

        # Executar OCR com layout otimizado para tabelas
        config_tesseract = "--psm 6"  # Modo 6: Suporta texto estruturado
        texto = pytesseract.image_to_string(img_processada, lang="por", config=config_tesseract)

        return texto
    except Exception as e:
        print(f"Erro ao processar a imagem: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python ocr_extractor.py <caminho_da_imagem>")
        sys.exit(1)

    imagem_path = sys.argv[1]

    resultado = realizar_ocr(imagem_path)
    print(resultado)
