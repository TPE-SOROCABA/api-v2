import sys
import pytesseract
from PIL import Image

# Função para recortar a imagem
def recortar_imagem(imagem_path, x, y, width, height):
    # Abre a imagem
    img = Image.open(imagem_path)        
    # Define as coordenadas do recorte
    largura, altura = img.size
    img_recortada = img.crop((x, y, x + width, y + height))
    # Salvar para debug
    # img_recortada.save("recorte.png")    
    return img_recortada

def realizar_ocr(imagem_path, x, y, width, height):
    try:
        # Pré-processa a imagem
        img_processada = recortar_imagem(imagem_path, x, y, width, height)

        # Executar OCR com layout otimizado para formulários
        config_tesseract = "--psm 6" # 1 = Automatic Page Segmentation
        texto = pytesseract.image_to_string(img_processada, lang="Latin", config=config_tesseract)

        return texto
    except Exception as e:
        print(f"Erro ao processar a imagem: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 6:
        print("Uso: python ocr_extractor.py <caminho_da_imagem> <x> <y> <width> <height>")
        sys.exit(1)

    imagem_path = sys.argv[1]
    x = int(sys.argv[2])
    y = int(sys.argv[3])
    width = int(sys.argv[4])
    height = int(sys.argv[5])

    resultado = realizar_ocr(imagem_path, x, y, width, height)
    print(resultado)
